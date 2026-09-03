<?php
declare(strict_types=1);
/**
 * SiteGround cron: refresh public_html/data/*.json from the PubQuiz API between site builds.
 * Same output shape as scripts/fetch-data.mjs. Location details are refreshed once a day (cached), the rest every run.
 * Images: uses the build's mirrored /img/api/<id>.webp when present; otherwise downloads the original bytes once.
 */
$cfg = require dirname(__DIR__) . '/ukp-config.php';
$root = rtrim($cfg['site_root'], '/');
$dataDir = "$root/data"; $imgDir = "$root/img/api"; $cacheDir = __DIR__ . '/cache';
@mkdir($dataDir, 0755, true); @mkdir($imgDir, 0755, true); @mkdir($cacheDir, 0755, true);
$base = rtrim($cfg['api_base'], '/');

function api(string $path, array $cfg, string $base): ?array {
  $ch = curl_init($base . $path);
  curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 30, CURLOPT_HTTPHEADER => ['Accept: application/json', 'Accept-Language: hr', 'X-API-Key: ' . $cfg['api_key'], 'User-Agent: kvizovi.hr cron']]);
  $res = curl_exec($ch); $code = curl_getinfo($ch, CURLINFO_RESPONSE_CODE); curl_close($ch);
  if ($res === false || $code !== 200) { fwrite(STDERR, "api $path -> $code\n"); return null; }
  $j = json_decode($res, true); return is_array($j) ? $j : null;
}
function slugify(string $s): string {
  $s = str_replace(['đ', 'Đ'], ['d', 'D'], $s);
  $s = iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $s) ?: $s;
  $s = strtolower(preg_replace('/[^a-z0-9]+/i', '-', $s) ?? ''); return substr(trim($s, '-'), 0, 60);
}
function mirror(?string $url, string $base, string $imgDir, array $cfg): ?array {
  if (!$url) return null;
  if (preg_match('#^/api/image/(\d+)$#', $url, $m)) {
    $id = $m[1];
    if (is_file("$imgDir/$id.webp")) return ['full' => "/img/api/$id.webp", 'small' => is_file("$imgDir/$id-s.webp") ? "/img/api/$id-s.webp" : "/img/api/$id.webp"];
    foreach (['jpg', 'png', 'webp', 'gif'] as $ext) if (is_file("$imgDir/$id.$ext")) return ['full' => "/img/api/$id.$ext", 'small' => "/img/api/$id.$ext"];
    $ch = curl_init($base . $url); curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 30, CURLOPT_HTTPHEADER => ['X-API-Key: ' . $cfg['api_key']]]);
    $bin = curl_exec($ch); $type = (string)curl_getinfo($ch, CURLINFO_CONTENT_TYPE); curl_close($ch);
    if (!$bin) return ['full' => $base . $url, 'small' => $base . $url];
    $ext = str_contains($type, 'png') ? 'png' : (str_contains($type, 'webp') ? 'webp' : (str_contains($type, 'gif') ? 'gif' : 'jpg'));
    file_put_contents("$imgDir/$id.$ext", $bin); return ['full' => "/img/api/$id.$ext", 'small' => "/img/api/$id.$ext"];
  }
  if (preg_match('#^https?://#', $url)) { $key = 'x' . substr(sha1($url), 0, 12); if (is_file("$imgDir/$key.webp")) return ['full' => "/img/api/$key.webp", 'small' => "/img/api/$key-s.webp"]; return null; }
  return null;
}
$city = fn($c) => ['id' => $c['cityId'] ?? $c['id'] ?? null, 'name' => $c['name'] ?? '', 'country' => $c['countryName'] ?? ($c['country']['name'] ?? ($c['country'] ?? null))];
$weekdayFromName = function (string $n): ?int { $map = ['ponedjeljkom' => 1, 'utorkom' => 2, 'srijedom' => 3, 'četvrtkom' => 4, 'cetvrtkom' => 4, 'petkom' => 5, 'subotom' => 6, 'nedjeljom' => 0]; foreach ($map as $k => $v) if (mb_stripos($n, $k) !== false) return $v; return null; };

$list = api('/api/pub-quiz-locations', $cfg, $base); if ($list === null) exit(1);
$detailsFile = "$cacheDir/details.json"; $details = [];
if (is_file($detailsFile) && filemtime($detailsFile) > time() - 86400) $details = json_decode(file_get_contents($detailsFile), true) ?: [];
if (!$details) { foreach ($list as $l) { $d = api('/api/pub-quiz-locations/' . $l['pubQuizLocationId'], $cfg, $base); if ($d) $details[$l['pubQuizLocationId']] = $d; usleep(120000); } file_put_contents($detailsFile, json_encode($details)); }

$events = api('/api/pub-quiz-events?from=' . date('Y-m-d'), $cfg, $base) ?? [];
$news = api('/api/news?limit=100', $cfg, $base) ?? [];

$locations = []; $byId = [];
foreach ($list as $l) {
  $d = $details[$l['pubQuizLocationId']] ?? []; $id = $l['pubQuizLocationId']; $slug = slugify($l['name']);
  $next = $l['nextEventDate'] ?? ($d['nextEventDate'] ?? null);
  $row = [
    'id' => $id, 'slug' => $slug, 'url' => "/lokacije/$id-$slug/", 'name' => $l['name'], 'venueName' => $l['venueName'], 'address' => $d['address'] ?? ($l['address'] ?? null),
    'city' => $city($l['city'] ?? []), 'lat' => $l['latitude'] ?? ($d['latitude'] ?? null), 'lng' => $l['longitude'] ?? ($d['longitude'] ?? null),
    'logo' => mirror($l['logoImageUrl'] ?? ($d['logoImageUrl'] ?? null), $base, $imgDir, $cfg), 'image' => mirror($l['imageUrl'] ?? ($d['imageUrl'] ?? null), $base, $imgDir, $cfg),
    'description' => trim((string)($d['description'] ?? '')) ?: null, 'defaultStartTime' => $d['defaultStartTime'] ?? ($l['defaultStartTime'] ?? null),
    'defaultMaxTeams' => $d['defaultMaxTeams'] ?? null, 'defaultMaxPlayersPerTeam' => $d['defaultMaxPlayersPerTeam'] ?? null, 'defaultFeeType' => $d['defaultFeeType'] ?? null, 'defaultFeeAmount' => $d['defaultFeeAmount'] ?? null,
    'defaultRequiresApproval' => (bool)($d['defaultRequiresApproval'] ?? false), 'registrationDeadlineHours' => $d['registrationDeadlineHours'] ?? null,
    'whatsapp' => $d['whatsAppCommunityLink'] ?? ($l['whatsAppCommunityLink'] ?? null),
    'weekday' => $weekdayFromName($l['name']) ?? ($next ? (int)date('w', strtotime(substr($next, 0, 10) . ' 12:00')) : null),
    'upcomingCount' => $l['upcomingEventsCount'] ?? 0, 'nextEventDate' => $next, 'nextEventStartTime' => $l['nextEventStartTime'] ?? null, 'nextEventName' => $l['nextEventName'] ?? null, 'isActive' => ($d['isActive'] ?? true) !== false,
  ];
  $locations[] = $row; $byId[$id] = $row;
}
$eventsOut = [];
foreach ($events as $e) {
  if (!empty($e['isHidden'])) continue; $loc = $byId[$e['locationId']] ?? null;
  $eventsOut[] = [
    'id' => $e['pubQuizEventId'], 'url' => "/dogadaji/{$e['pubQuizEventId']}/", 'locationId' => $e['locationId'], 'locationUrl' => $loc['url'] ?? null, 'locationName' => $e['locationName'], 'venueName' => $e['venueName'],
    'city' => $city($e['city'] ?? []), 'address' => $loc['address'] ?? null, 'lat' => $loc['lat'] ?? null, 'lng' => $loc['lng'] ?? null, 'logo' => $loc['logo'] ?? null,
    'image' => mirror($e['eventImageUrl'] ?? null, $base, $imgDir, $cfg) ?? ($loc['image'] ?? null),
    'date' => substr($e['eventDate'], 0, 10), 'startTime' => $e['startTime'], 'name' => trim((string)($e['name'] ?? '')) ?: null, 'category' => $e['categoryName'] ?? null, 'subCategory' => $e['subCategoryName'] ?? null,
    'maxTeams' => $e['maxTeams'] ?? null, 'registered' => $e['registeredTeamsCount'] ?? 0, 'spotsRemaining' => $e['spotsRemaining'] ?? null, 'registrationDeadline' => $e['registrationDeadline'] ?? null, 'requiresApproval' => (bool)($e['requiresApproval'] ?? false),
    'isCancelled' => (bool)($e['isCancelled'] ?? false), 'feeType' => $e['feeType'] ?? null, 'feeAmount' => $e['feeAmount'] ?? null, 'maxPlayersPerTeam' => $e['maxPlayersPerTeam'] ?? null, 'resultsPublished' => (bool)($e['resultsPublished'] ?? false), 'season' => $e['season']['name'] ?? null, 'whatsapp' => $loc['whatsapp'] ?? null,
  ];
}
usort($eventsOut, fn($a, $b) => strcmp($a['date'] . $a['startTime'], $b['date'] . $b['startTime']));

// Drop events that already started (the API's from=<today> still returns this morning's quiz),
// then recompute each location's "next quiz" from what is genuinely still ahead.
$cutoff = time() - 3 * 3600;
$eventsOut = array_values(array_filter($eventsOut, fn($e) => strtotime($e['date'] . ' ' . $e['startTime']) > $cutoff));
$nextByLocation = [];
foreach ($eventsOut as $e) if (!$e['isCancelled'] && !isset($nextByLocation[$e['locationId']])) $nextByLocation[$e['locationId']] = $e;
foreach ($locations as &$l) {
  $next = $nextByLocation[$l['id']] ?? null;
  $l['upcomingCount'] = count(array_filter($eventsOut, fn($e) => $e['locationId'] === $l['id'] && !$e['isCancelled']));
  $l['nextEventDate'] = $next['date'] ?? null;
  $l['nextEventStartTime'] = $next['startTime'] ?? null;
  $l['nextEventName'] = $next['name'] ?? null;
}
unset($l);
$newsOut = array_map(fn($n) => [
  'id' => $n['newsId'], 'url' => "/novosti/{$n['newsId']}/", 'title' => trim((string)$n['title']), 'summary' => trim((string)($n['summary'] ?? '')), 'content' => trim(str_replace("\r\n", "\n", (string)($n['content'] ?? ''))),
  'image' => mirror($n['imageUrl'] ?? null, $base, $imgDir, $cfg), 'publishedDate' => $n['publishedDate'], 'locationId' => $n['locationId'] ?? null, 'locationName' => $n['locationName'] ?? null, 'locationUrl' => isset($n['locationId']) ? ($byId[$n['locationId']]['url'] ?? null) : null,
], $news);
usort($newsOut, fn($a, $b) => strcmp($b['publishedDate'], $a['publishedDate']));
$cities = [];
foreach ($locations as $l) { $n = $l['city']['name']; if ($n === '') continue; $cities[$n] ??= ['id' => $l['city']['id'], 'name' => $n, 'slug' => slugify($n), 'country' => $l['city']['country'], 'locations' => 0, 'upcoming' => 0]; $cities[$n]['locations']++; $cities[$n]['upcoming'] += $l['upcomingCount']; }
$cities = array_values($cities); usort($cities, fn($a, $b) => strcoll($a['name'], $b['name']));

$write = function (string $f, $d) use ($dataDir) { $tmp = "$dataDir/$f.tmp"; file_put_contents($tmp, json_encode($d, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)); rename($tmp, "$dataDir/$f"); };
$write('locations.json', $locations); $write('events.json', $eventsOut); $write('news.json', $newsOut); $write('cities.json', $cities);
$write('meta.json', ['generatedAt' => gmdate('c'), 'locations' => count($locations), 'cities' => count($cities), 'events' => count($eventsOut), 'news' => count($newsOut), 'source' => 'cron']);
echo 'ok ' . count($locations) . ' locations, ' . count($eventsOut) . " events\n";
