<?php
declare(strict_types=1);
/**
 * SiteGround cron: refresh public_html/data/*.json from the PubQuiz API between site builds.
 * Same output shape as scripts/fetch-data.mjs. Location details are refreshed once a day (cached), the rest every run.
 * Images: uses the build's mirrored /img/api/<id>.webp when present; otherwise downloads the original bytes once.
 */
/**
 * Everything this script has to say used to go to STDERR, and the cron line sent STDERR to
 * /dev/null: eleven venues lost their description for a day and nothing anywhere recorded it.
 * It now keeps its own log next to itself, so the record survives however the cron is invoked,
 * and the run's health is also published in data/meta.json where it can be read over HTTP.
 */
@set_time_limit(0); // the daily detail sweep is ~140 requests with retries
define('UKP_LOG', __DIR__ . '/refresh.log');
// Trim before writing rather than on a schedule; nobody is going to rotate this by hand.
if (is_file(UKP_LOG) && filesize(UKP_LOG) > 262144) @file_put_contents(UKP_LOG, implode('', array_slice(file(UKP_LOG), -500)));
function logline(string $msg): void {
  $line = gmdate('c') . ' ' . rtrim($msg) . "\n";
  fwrite(STDERR, $line);
  @file_put_contents(UKP_LOG, $line, FILE_APPEND | LOCK_EX);
}
register_shutdown_function(function () {
  $e = error_get_last();
  if ($e && in_array($e['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true)) logline("FATAL {$e['message']} at {$e['file']}:{$e['line']}");
});

$cfg = require dirname(__DIR__) . '/ukp-config.php';
$root = rtrim($cfg['site_root'], '/');
$dataDir = "$root/data"; $imgDir = "$root/img/api"; $cacheDir = __DIR__ . '/cache';
@mkdir($dataDir, 0755, true); @mkdir($imgDir, 0755, true); @mkdir($cacheDir, 0755, true);
$base = rtrim($cfg['api_base'], '/');

/**
 * A dropped request used to be a shrug: null, a line on STDERR the cron threw away, and a location
 * served for the next 24 hours with no description, no fee and no team cap. Transient answers
 * (network, 429, 5xx) are now retried with a widening pause; a 404 or a 403 is a real answer and is
 * taken at face value rather than burning the per-IP budget three times over.
 */
function api(string $path, array $cfg, string $base, int $tries = 3): ?array {
  for ($try = 1; ; $try++) {
    $ch = curl_init($base . $path);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 30, CURLOPT_HTTPHEADER => ['Accept: application/json', 'Accept-Language: hr', 'X-API-Key: ' . $cfg['api_key'], 'User-Agent: kvizovi.hr cron']]);
    $res = curl_exec($ch); $code = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    if ($res !== false && $code === 200) { $j = json_decode($res, true); if (is_array($j)) return $j; }
    $retryable = $res === false || $code === 429 || $code >= 500;
    if (!$retryable || $try >= $tries) { logline("api $path -> $code" . ($try > 1 ? " (gave up after $try tries)" : '')); return null; }
    sleep($try); // the rate-limit window is a minute, so a second or two is enough to clear a burst
  }
}
/**
 * Mirrors slugify() in src/lib/format.ts exactly. The two must agree, or every card the browser
 * redraws from this JSON links to a page that was built under a different name: iconv's
 * transliteration turned the "•" in "VIVA Caffe • Lounge • Bar" into the letter o, and the
 * venue's page was a 404 from every list. Croatian letters map to ASCII, accents are stripped
 * when intl is available, and anything else outside a-z0-9 is a separator.
 */
function slugify(string $s): string {
  $s = strtr($s, ['č' => 'c', 'ć' => 'c', 'š' => 's', 'ž' => 'z', 'đ' => 'd', 'Č' => 'c', 'Ć' => 'c', 'Š' => 's', 'Ž' => 'z', 'Đ' => 'd']);
  if (class_exists('Normalizer')) { $n = Normalizer::normalize($s, Normalizer::FORM_D); if ($n !== false) $s = preg_replace('/\p{Mn}+/u', '', $n) ?? $n; }
  $s = preg_replace('/[^a-z0-9]+/', '-', strtolower($s)) ?? '';
  return substr(trim($s, '-'), 0, 60);
}
function mirror(?string $url, string $base, string $imgDir, array $cfg): ?array {
  if (!$url) return null;
  if (preg_match('#^/api/image/(\d+)$#', $url, $m)) {
    $id = $m[1];
    if (is_file("$imgDir/$id.webp")) return ['full' => "/img/api/$id.webp", 'small' => is_file("$imgDir/$id-s.webp") ? "/img/api/$id-s.webp" : "/img/api/$id.webp"];
    foreach (['jpg', 'png', 'webp', 'gif'] as $ext) if (is_file("$imgDir/$id.$ext")) return ['full' => "/img/api/$id.$ext", 'small' => "/img/api/$id.$ext"];
    $ch = curl_init($base . $url); curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 30, CURLOPT_HTTPHEADER => ['X-API-Key: ' . $cfg['api_key']]]);
    $bin = curl_exec($ch); $type = (string)curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
    if (!$bin) return ['full' => $base . $url, 'small' => $base . $url];
    $ext = str_contains($type, 'png') ? 'png' : (str_contains($type, 'webp') ? 'webp' : (str_contains($type, 'gif') ? 'gif' : 'jpg'));
    file_put_contents("$imgDir/$id.$ext", $bin); return ['full' => "/img/api/$id.$ext", 'small' => "/img/api/$id.$ext"];
  }
  if (preg_match('#^https?://#', $url)) { $key = 'x' . substr(sha1($url), 0, 12); if (is_file("$imgDir/$key.webp")) return ['full' => "/img/api/$key.webp", 'small' => "/img/api/$key-s.webp"]; return null; }
  return null;
}
$city = fn($c) => ['id' => $c['cityId'] ?? $c['id'] ?? null, 'name' => $c['name'] ?? '', 'country' => $c['countryName'] ?? ($c['country']['name'] ?? ($c['country'] ?? null))];
$weekdayFromName = function (string $n): ?int { $map = ['ponedjeljkom' => 1, 'utorkom' => 2, 'srijedom' => 3, 'četvrtkom' => 4, 'cetvrtkom' => 4, 'petkom' => 5, 'subotom' => 6, 'nedjeljom' => 0]; foreach ($map as $k => $v) if (mb_stripos($n, $k) !== false) return $v; return null; };

$list = api('/api/pub-quiz-locations', $cfg, $base);
if ($list === null) { logline('ABORT: location list unavailable, leaving the last snapshot in place'); exit(1); }
/**
 * Location detail (description, fee, caps) is one request per location, so the map is cached for a
 * day. Two rules keep one bad run from owning that day. The map is stamped complete only when every
 * location resolved: a partial map is still written, because some detail beats none, but it is not
 * stamped, so the next run retries the gaps instead of serving them empty until tomorrow. And a
 * location created mid-day is fetched on the next run rather than waiting for the cache to age out.
 * Both were real: eleven venues lost their description, fee and team cap on the site for a full day
 * because a handful of requests failed while the cache was being written.
 */
$detailsFile = "$cacheDir/details.json";
$cached = is_file($detailsFile) ? (json_decode(file_get_contents($detailsFile), true) ?: []) : [];
// Envelope as of 2026-09; a bare id => detail map is the older format and re-reads once on upgrade.
$details = isset($cached['details']) && is_array($cached['details']) ? $cached['details'] : $cached;
$sweptAt = (int)($cached['at'] ?? 0);
$sweep = $sweptAt <= time() - 86400; // the whole map is re-read once a day

// A full sweep when the map is due, otherwise just the holes: a location created this morning, or
// one whose request failed earlier. Retrying only the holes matters - a venue the API cannot serve
// at all would otherwise drag the entire 137-request sweep back in every fifteen minutes.
$want = [];
foreach ($list as $l) if ($sweep || !isset($details[$l['pubQuizLocationId']])) $want[] = $l['pubQuizLocationId'];
foreach ($want as $id) {
  $d = api("/api/pub-quiz-locations/$id", $cfg, $base);
  if ($d) $details[$id] = $d;
  // 4/s. The API allows 600 requests a minute per IP; 137 of these run back to back, so the old
  // 120 ms gap sat close enough to the ceiling that scattered 429s were silently dropping venues.
  usleep(250000);
}
// A failed fetch leaves any previously cached detail in place, so the venue degrades to yesterday's
// copy rather than to nothing. Only a venue with no detail at all counts as missing.
$missing = [];
foreach ($list as $l) if (!isset($details[$l['pubQuizLocationId']])) $missing[] = $l['pubQuizLocationId'];
if ($want) {
  // A top-up keeps the map's original age; only a full sweep resets it, or a location added every
  // few hours would keep pushing the expiry out and the descriptions would never be re-read.
  file_put_contents($detailsFile, json_encode(['at' => $sweep ? time() : $sweptAt, 'complete' => !$missing, 'details' => $details]));
  if ($missing) logline('no detail for ' . count($missing) . ' of ' . count($list) . ' locations (retried next run): ' . implode(',', array_slice($missing, 0, 20)));
}
// Told to the site in meta.json: live.ts may only act on a missing description when the snapshot is
// known whole, so a partial run can never blank a description the build got right.
$detailsState = $missing ? 'partial' : 'complete';

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
    'defaultMaxTeams' => $d['defaultMaxTeams'] ?? null, 'defaultMaxPlayersPerTeam' => $d['defaultMaxPlayersPerTeam'] ?? null, 'defaultFeeType' => $d['defaultFeeType'] ?? null, 'defaultFeeCurrency' => $d['defaultFeeCurrency'] ?? 'EUR', 'defaultFeeAmount' => $d['defaultFeeAmount'] ?? null,
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
    'isCancelled' => (bool)($e['isCancelled'] ?? false), 'feeType' => $e['feeType'] ?? null, 'feeAmount' => $e['feeAmount'] ?? null, 'feeCurrency' => $e['feeCurrency'] ?? 'EUR', 'maxPlayersPerTeam' => $e['maxPlayersPerTeam'] ?? null, 'resultsPublished' => (bool)($e['resultsPublished'] ?? false), 'season' => $e['season']['name'] ?? null, 'whatsapp' => $loc['whatsapp'] ?? null,
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
$write('meta.json', ['generatedAt' => gmdate('c'), 'locations' => count($locations), 'cities' => count($cities), 'events' => count($eventsOut), 'news' => count($newsOut), 'source' => 'cron', 'locationDetails' => $detailsState]);
$summary = 'ok ' . count($locations) . ' locations, ' . count($eventsOut) . ' events, ' . count($newsOut) . ' news, details ' . $detailsState;
echo "$summary\n";
if ($detailsState !== 'complete') { logline($summary); exit(2); } // non-zero: a cron set to mail on failure will
@file_put_contents(__DIR__ . '/last-ok.txt', gmdate('c') . " $summary\n"); // heartbeat for a healthy run
