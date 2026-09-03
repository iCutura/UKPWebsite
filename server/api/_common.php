<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function ukp_config(): array {
  $f = dirname(__DIR__, 2) . '/ukp-config.php';   // kvizovi.hr/ukp-config.php (outside web root)
  if (!is_file($f)) ukp_fail(500, 'Poslužitelj nije konfiguriran.');
  return require $f;
}
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
  if (!empty($d['website'])) { echo json_encode(['ok' => true]); exit; } // honeypot: pretend success
  $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
  if ($origin && !preg_match('#^https?://(www\.)?kvizovi\.hr$#', $origin) && !str_contains($origin, 'localhost')) ukp_fail(403, 'Zabranjeno.');
  return $d;
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
