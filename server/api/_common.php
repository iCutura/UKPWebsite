<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

require_once __DIR__ . '/_config.php';   // ukp_config(): shared with the HTML endpoints
function ukp_fail(int $code, string $message): never {
  http_response_code($code);
  echo json_encode(['ok' => false, 'message' => $message], JSON_UNESCAPED_UNICODE);
  exit;
}
function ukp_input(): array {
  if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') ukp_fail(405, 'Method not allowed');
  $raw = file_get_contents('php://input') ?: '';
  if (strlen($raw) > 20000) ukp_fail(413, 'Prevelik zahtjev.');
  $d = json_decode($raw, true);
  if (!is_array($d)) ukp_fail(400, 'Neispravan zahtjev.');
  $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
  if ($origin && !preg_match('#^https?://(www\.)?kvizovi\.hr$#', $origin) && !str_contains($origin, 'localhost')) ukp_fail(403, 'Zabranjeno.');
  return $d;
}
/**
 * The anti-spam trap: a field no human sees. It used to be called `website` and answer a fake
 * `ok:true`, but browser autofill fills a field of that name, so real players were told "code sent"
 * for a request that was never made, and nothing anywhere recorded it (F-21). The field is now
 * `ukp_x9` (no autofill heuristic knows it; not even `hp`, which is "phone" in some locales), and `website` is still read so a page cached before the rename is judged the same way.
 * Returns the name of the field that fired, or null. The caller answers with a visible error.
 */
const UKP_HONEYPOT_FIELDS = ['ukp_x9', 'website'];
function ukp_honeypot(array $d): ?string {
  foreach (UKP_HONEYPOT_FIELDS as $k) if (isset($d[$k]) && trim((string)$d[$k]) !== '') return $k;
  return null;
}
/** "ana.anic@x.hr" -> "a***@x.hr": enough to match a player's complaint, not enough to leak the address. */
function ukp_mask_email(string $email): string {
  $at = strrpos($email, '@');
  if ($at === false || $at === 0) return $email === '' ? '' : '***';
  return mb_substr($email, 0, 1) . '***' . substr($email, $at);
}
/** One line per dropped request, next to ukp-config.php (outside the web root), trimmed before it grows past 256 KB. */
function ukp_log_honeypot(string $endpoint, string $field, array $context): void {
  $f = dirname(__DIR__, 2) . '/ukp-honeypot.log';
  if (is_file($f) && filesize($f) > 262144) @file_put_contents($f, implode('', array_slice(file($f) ?: [], -500)));
  $line = gmdate('c') . ' ' . json_encode(['endpoint' => $endpoint, 'field' => $field, 'ip' => $_SERVER['REMOTE_ADDR'] ?? '', 'ua' => mb_substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 200)] + $context, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n";
  @file_put_contents($f, $line, FILE_APPEND | LOCK_EX);
}
/** Refuse a request the trap caught, visibly: a human who reads this can try again, a bot learns nothing new. */
function ukp_fail_honeypot(string $message): never {
  http_response_code(422);
  echo json_encode(['ok' => false, 'code' => 'spam_suspected', 'message' => $message], JSON_UNESCAPED_UNICODE);
  exit;
}
function ukp_str(array $d, string $k, int $max): string { return mb_substr(trim((string)($d[$k] ?? '')), 0, $max); }
/** Very small per-IP throttle: at most $limit calls per $window seconds, tracked in the system temp dir. */
function ukp_throttle(string $bucket, int $limit, int $window): void {
  $ip = $_SERVER['REMOTE_ADDR'] ?? '0';
  $f = sys_get_temp_dir() . '/ukp-' . $bucket . '-' . md5($ip);
  $now = time();
  $hits = is_file($f) ? array_filter(array_map('intval', file($f, FILE_IGNORE_NEW_LINES) ?: []), fn($t) => $t > $now - $window) : [];
  if (count($hits) >= $limit) ukp_fail(429, 'Previše pokušaja. Pokušaj za koju minutu.');
  $hits[] = $now; file_put_contents($f, implode("\n", $hits), LOCK_EX);
}
