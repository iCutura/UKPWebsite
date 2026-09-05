<?php
// Landing page for app invite links when the app is not installed (or on desktop).
// Rewritten to by .htaccess: /join/team/{code}, /play/quiz/{id}, /get. Fills the built
// /link/index.html template with the team or quiz the visitor was sent to, using the API's
// api/links metadata with the website key. Never called by the browser directly.
declare(strict_types=1);
require_once __DIR__ . '/_config.php';

const UKP_LINK_CACHE_TTL = 300;

function ukp_api_json(string $path, array $cfg): ?array {
  $ch = curl_init(rtrim($cfg['api_base'], '/') . $path);
  curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 8, CURLOPT_HTTPHEADER => ['Accept: application/json', 'Accept-Language: hr', 'X-API-Key: ' . $cfg['api_key'], 'User-Agent: kvizovi.hr link']]);
  $res = curl_exec($ch); $code = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
  if ($res === false || $code !== 200) return null;
  $j = json_decode($res, true);
  return is_array($j) ? $j : null;
}

/** Five-minute file cache per link so a crawler storm never turns into an API storm. */
function ukp_api_cached(string $path, array $cfg): ?array {
  $f = sys_get_temp_dir() . '/ukp-link-' . md5($path);
  if (is_file($f) && filemtime($f) > time() - UKP_LINK_CACHE_TTL) {
    $j = json_decode((string)file_get_contents($f), true);
    if (is_array($j) && array_key_exists('data', $j)) return $j['data'];
  }
  $data = ukp_api_json($path, $cfg);
  file_put_contents($f, json_encode(['data' => $data]), LOCK_EX);
  return $data;
}

$cfg = ukp_config();
$kind = $_GET['kind'] ?? 'get';
$open = 'https://api.injeel-it.hr/get';
$canonical = 'https://kvizovi.hr/get';
$status = 200;
$title = 'Zaigraj pub kviz uz UKP Quiz';
$desc = 'Otvori Urbanu kviz priču: prijave, rezultati, lige i podsjetnici za svaki kviz.';
$image = null;

if ($kind === 'team') {
  $code = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', (string)($_GET['code'] ?? '')) ?? '');
  if ($code === '' || strlen($code) > 16) {
    $status = 404;
    $title = 'Ova poveznica za ekipu ne vrijedi';
    $desc = 'Ekipa ne postoji ili je poveznica istekla. Zamoli kapetana za novu.';
  } else {
    $open = "https://api.injeel-it.hr/join/team/$code";
    $canonical = "https://kvizovi.hr/join/team/$code";
    $team = ukp_api_cached("/api/links/team/$code", $cfg);
    if ($team === null) {
      $status = 404;
      $title = 'Ova poveznica za ekipu ne vrijedi';
      $desc = 'Ekipa ne postoji ili je poveznica istekla. Zamoli kapetana za novu.';
    } else {
      $n = (int)($team['memberCount'] ?? 0);
      $title = 'Pridruži se ekipi ' . (string)($team['name'] ?? '');
      $players = $n === 1 ? '1 igrač te čeka. ' : ($n > 1 ? "$n igrača te čeka. " : '');
      $desc = $players . 'Otvori UKP Quiz aplikaciju i uđi u ekipu jednim dodirom.';
    }
  }
} elseif ($kind === 'quiz') {
  $id = (int)($_GET['id'] ?? 0);
  if ($id <= 0) {
    $status = 404;
    $title = 'Ovaj kviz više nije dostupan';
    $desc = 'Kviz ne postoji ili je uklonjen. U aplikaciji te čekaju svi ostali.';
  } else {
    $open = "https://api.injeel-it.hr/play/quiz/$id";
    $canonical = "https://kvizovi.hr/play/quiz/$id";
    $quiz = ukp_api_cached("/api/links/quiz/$id", $cfg);
    if ($quiz === null) {
      $status = 404;
      $title = 'Ovaj kviz više nije dostupan';
      $desc = 'Kviz ne postoji ili je uklonjen. U aplikaciji te čekaju svi ostali.';
    } else {
      $title = (string)($quiz['name'] ?? 'Kviz');
      $qd = trim((string)($quiz['description'] ?? ''));
      $desc = $qd !== '' ? $qd : 'Otvori Urbanu kviz priču i zaigraj ovaj kviz.';
      $image = isset($quiz['imageUrl']) && is_string($quiz['imageUrl']) && $quiz['imageUrl'] !== '' ? $quiz['imageUrl'] : null;
    }
  }
}

$template = rtrim((string)$cfg['site_root'], '/') . '/link/index.html';
if (!is_file($template)) { http_response_code(500); exit('Landing template missing.'); }
$html = (string)file_get_contents($template);
$esc = fn(string $s): string => htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
$html = str_replace(['{{TITLE}}', '{{DESCRIPTION}}', '{{OPEN_URL}}'], [$esc($title), $esc($desc), $esc($open)], $html);
$html = str_replace('https://kvizovi.hr/link/', $canonical, $html);
if ($image !== null) {
  $html = preg_replace('/(<meta property="og:image" content=")[^"]*(")/', '$1' . $esc($image) . '$2', $html, 1) ?? $html;
}
http_response_code($status);
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-cache');
echo $html;
