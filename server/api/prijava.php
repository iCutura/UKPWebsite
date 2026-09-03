<?php
declare(strict_types=1);
// Website team registration proxy (kvizovi.hr -> PubQuiz API external-registrations). Keeps the API key server-side.
// Actions: start (sends e-mail code), confirm (creates the registration), resend.
require __DIR__ . '/_common.php';
$cfg = ukp_config();
$d = ukp_input();
if (empty($cfg['registration_enabled'])) ukp_fail(503, 'Prijave putem weba trenutno nisu uključene.');

$action = (string)($d['action'] ?? '');
$eventId = (int)($d['eventId'] ?? 0);
if ($eventId <= 0) ukp_fail(422, 'Nedostaje termin.');
$base = rtrim($cfg['api_base'], '/') . "/api/pub-quiz-events/{$eventId}/external-registrations";

switch ($action) {
  case 'start':
    ukp_throttle('prijava-start', 6, 600);
    $url = $base;
    $payload = [
      'teamName' => ukp_str($d, 'teamName', 100), 'contactName' => ukp_str($d, 'contactName', 100),
      'contactEmail' => ukp_str($d, 'contactEmail', 200), 'contactPhone' => ukp_str($d, 'contactPhone', 50),
      'playerCount' => isset($d['playerCount']) && $d['playerCount'] !== null && $d['playerCount'] !== '' ? (int)$d['playerCount'] : null,
    ];
    break;
  case 'confirm':
    ukp_throttle('prijava-confirm', 20, 600);
    $requestId = (int)($d['requestId'] ?? 0); if ($requestId <= 0) ukp_fail(422, 'Nedostaje prijava.');
    $url = "$base/$requestId/confirm";
    $payload = ['code' => ukp_str($d, 'code', 8)];
    break;
  case 'resend':
    ukp_throttle('prijava-resend', 6, 600);
    $requestId = (int)($d['requestId'] ?? 0); if ($requestId <= 0) ukp_fail(422, 'Nedostaje prijava.');
    $url = "$base/$requestId/resend";
    $payload = new stdClass();
    break;
  default:
    ukp_fail(400, 'Nepoznata radnja.');
}

$ch = curl_init($url);
curl_setopt_array($ch, [
  CURLOPT_POST => true, CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE), CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 20,
  CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Accept: application/json', 'Accept-Language: hr', 'X-API-Key: ' . $cfg['api_key'], 'X-Forwarded-For: ' . ($_SERVER['REMOTE_ADDR'] ?? '')],
]);
$res = curl_exec($ch); $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE); curl_close($ch);
if ($res === false || $status >= 500) ukp_fail(502, 'Prijava trenutno nije moguća. Pokušaj kroz aplikaciju ili nas nazovi.');
$j = json_decode((string)$res, true);
if ($status >= 400) {
  http_response_code($status);
  // ASP.NET model validation returns { errors: {...}, title }, our service returns { error, code }.
  $code = is_array($j) && isset($j['code']) ? (string)$j['code'] : ($status === 429 ? 'rate_limited' : 'invalid_input');
  echo json_encode(['ok' => false, 'code' => $code, 'message' => is_array($j) ? (string)($j['error'] ?? $j['title'] ?? '') : ''], JSON_UNESCAPED_UNICODE);
  exit;
}
http_response_code($status === 201 ? 201 : 200);
echo json_encode(['ok' => true] + (is_array($j) ? $j : []), JSON_UNESCAPED_UNICODE);
