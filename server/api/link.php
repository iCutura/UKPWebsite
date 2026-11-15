<?php
// Landing page for app invite links when the app is not installed (or on desktop).
// Rewritten to by .htaccess: /join/team/{code}, /join/arena/{code}, /play/quiz/{id}, /news/{id}, /get, and
// the friends links /top10/{code}, /add/{code}, /seat/{code} (fixed copy, no API call). Fills
// the built /link/index.html template with the team, match or quiz the visitor was sent to, using
// the API's api/links metadata with the website key. Never called by the browser directly.
declare(strict_types=1);
require_once __DIR__ . '/_config.php';
require_once __DIR__ . '/link-arena-lib.php';

const UKP_LINK_CACHE_TTL = 300;
// A private match changes by the minute (players join, it starts, it ends), so its preview and
// its "no such match" answer are held for a minute, not five.
const UKP_ARENA_LINK_CACHE_TTL = 60;

function ukp_api_json(string $path, array $cfg): ?array {
  $ch = curl_init(rtrim($cfg['api_base'], '/') . $path);
  curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 8, CURLOPT_HTTPHEADER => ['Accept: application/json', 'Accept-Language: hr', 'X-API-Key: ' . $cfg['api_key'], 'User-Agent: kvizovi.hr link']]);
  $res = curl_exec($ch); $code = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
  if ($res === false || $code !== 200) return null;
  $j = json_decode($res, true);
  return is_array($j) ? $j : null;
}

/** File cache per link so a crawler storm never turns into an API storm. Negatives are cached too. */
function ukp_api_cached(string $path, array $cfg, int $ttl = UKP_LINK_CACHE_TTL): ?array {
  $f = sys_get_temp_dir() . '/ukp-link-' . md5($path);
  if (is_file($f) && filemtime($f) > time() - $ttl) {
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
} elseif ($kind === 'arena') {
  $code = ukp_arena_code((string)($_GET['code'] ?? ''));
  if ($code === null) {
    ['status' => $status, 'title' => $title, 'desc' => $desc] = ukp_arena_copy(null);
  } else {
    $open = "https://api.injeel-it.hr/join/arena/$code";
    $canonical = "https://kvizovi.hr/join/arena/$code";
    $match = ukp_api_cached("/api/links/arena/$code", $cfg, UKP_ARENA_LINK_CACHE_TTL);
    ['status' => $status, 'title' => $title, 'desc' => $desc] = ukp_arena_copy($match);
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
} elseif ($kind === 'news') {
  $id = (int)($_GET['id'] ?? 0);
  if ($id <= 0) {
    $status = 404;
    $title = 'Ova vijest više nije dostupna';
    $desc = 'Vijest ne postoji ili je uklonjena. U aplikaciji te čekaju sve ostale.';
  } else {
    $open = "https://api.injeel-it.hr/news/$id";
    $canonical = "https://kvizovi.hr/news/$id";
    $news = ukp_api_cached("/api/links/news/$id", $cfg);
    if ($news === null) {
      $status = 404;
      $title = 'Ova vijest više nije dostupna';
      $desc = 'Vijest ne postoji ili je uklonjena. U aplikaciji te čekaju sve ostale.';
    } else {
      $title = (string)($news['title'] ?? 'Vijest');
      $nd = trim((string)($news['summary'] ?? ''));
      $desc = $nd !== '' ? $nd : 'Otvori Urbanu kviz priču i pročitaj vijest.';
      $image = isset($news['imageUrl']) && is_string($news['imageUrl']) && $news['imageUrl'] !== '' ? $news['imageUrl'] : null;
    }
  }
} elseif ($kind === 'top10' || $kind === 'add' || $kind === 'seat') {
  // Friends and sharing (2026-11-15). These pages name nobody and show no answer, so they need
  // nothing from the API: the copy is fixed, and the button opens the same path on the API host,
  // which the apps also claim. "today" is the QR on the stage slide at quiz nights.
  $code = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', (string)($_GET['code'] ?? '')) ?? '');
  $path = $kind === 'top10' && $code === 'TODAY' ? 'top10/today' : "$kind/$code";
  $open = "https://api.injeel-it.hr/$path";
  $canonical = "https://kvizovi.hr/$path";
  if ($kind === 'top10' && $code === 'TODAY') {
    $title = 'Današnji dnevni izazov';
    $desc = 'Deset odgovora, pet srca. Otvori UKP Quiz aplikaciju i zaigraj.';
  } elseif ($kind === 'top10') {
    $title = 'Stigao ti je dnevni izazov';
    $desc = 'Odigraj isti izazov u UKP Quiz aplikaciji. Odgovori se ovdje ne prikazuju.';
  } elseif ($kind === 'add') {
    $title = 'Poziv u prijatelje';
    $desc = 'Otvori UKP Quiz aplikaciju i prihvati poziv, pa igrajte zajedno.';
  } else {
    $title = 'Slobodno mjesto na kvizu';
    $desc = 'Ekipa ima jedno slobodno mjesto. Otvori UKP Quiz aplikaciju i zauzmi ga.';
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
