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
 * The spam check for a public form post, which is a question of time, not of a trap field.
 *
 * The forms used to carry a text input no person could see (`website`, then `ukp_x9`), and a value
 * in it meant a bot. Twice that judged people instead. First the trap answered a fake `ok:true`, so
 * autofilled players waited for a code that never left (F-21, 2026-09-23). Then it answered a
 * visible refusal, and its log showed who it refused over the eleven days that followed: 242 of 245
 * lines were people, 65 of them in Instagram's in-app browser on Android, which fills every text
 * input in a form whether it is on screen or not, and not one line was a bot. The input is gone
 * from both forms. What the browser sends instead is `ukp_t`, the milliseconds between the page
 * binding the form and the submit: a person needs seconds to type a team name and tick the consent
 * box, a script posts the instant the page is parsed.
 *
 * A request without a readable `ukp_t` (an older page, another client) is let through and logged,
 * so the gap can be watched. The old trap names are still read, as a signal for the log only;
 * nothing is ever refused on them again.
 *
 * @return array{reject: bool, elapsedMs: ?int, trap: ?string}
 */
const UKP_MIN_FILL_MS = 3000;
const UKP_LEGACY_TRAP_FIELDS = ['ukp_x9', 'website'];
function ukp_spam_verdict(array $d): array {
  $t = $d['ukp_t'] ?? null;
  $readable = (is_int($t) || is_float($t) || (is_string($t) && is_numeric($t))) && (float)$t >= 0;
  $elapsed = $readable ? (int)min((float)$t, 86_400_000.0) : null;
  $trap = null;
  foreach (UKP_LEGACY_TRAP_FIELDS as $k) if (isset($d[$k]) && trim((string)$d[$k]) !== '') { $trap = $k; break; }
  return ['reject' => $elapsed !== null && $elapsed < UKP_MIN_FILL_MS, 'elapsedMs' => $elapsed, 'trap' => $trap];
}
/** "ana.anic@x.hr" -> "a***@x.hr": enough to match a player's complaint, not enough to leak the address. */
function ukp_mask_email(string $email): string {
  $at = strrpos($email, '@');
  if ($at === false || $at === 0) return $email === '' ? '' : '***';
  return mb_substr($email, 0, 1) . '***' . substr($email, $at);
}
/**
 * One line per request worth a second look, next to ukp-config.php (outside the web root), trimmed
 * before it grows past 256 KB. Every refusal is logged; an accepted request only when it carried a
 * signal (a filled legacy trap field, or no timing at all), so a normal start leaves no line. The
 * file keeps its old name so the history since 2026-09-23 stays in one place.
 */
function ukp_log_spam(string $endpoint, array $verdict, array $context): void {
  $reason = $verdict['reject'] ? 'too_fast' : ($verdict['trap'] !== null ? 'trap_filled' : ($verdict['elapsedMs'] === null ? 'no_timing' : null));
  if ($reason === null) return;
  $f = dirname(__DIR__, 2) . '/ukp-honeypot.log';
  if (is_file($f) && filesize($f) > 262144) @file_put_contents($f, implode('', array_slice(file($f) ?: [], -500)));
  $line = gmdate('c') . ' ' . json_encode([
    'endpoint' => $endpoint, 'verdict' => $verdict['reject'] ? 'rejected' : 'accepted', 'reason' => $reason,
    'elapsedMs' => $verdict['elapsedMs'], 'trap' => $verdict['trap'],
    'ip' => $_SERVER['REMOTE_ADDR'] ?? '', 'ua' => mb_substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 200),
  ] + $context, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n";
  @file_put_contents($f, $line, FILE_APPEND | LOCK_EX);
}
/** Refuse a request the check caught, visibly: a person who reads this can try again, a bot learns nothing new. */
function ukp_fail_spam(string $message): never {
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
