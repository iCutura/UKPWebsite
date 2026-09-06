<?php
declare(strict_types=1);
/**
 * The cron's staleness decisions, kept out of refresh-data.php so a test can require them without
 * the script running against the live API. Exercised by tests/unit/cron-refresh.test.ts.
 */

/**
 * Which location details to read this run. Every location the cache has never seen (a venue added
 * this morning, or one whose request failed earlier), plus the oldest of the rest up to $slice.
 *
 * The map used to be swept whole once a day and otherwise only topped up, so every field that only
 * the detail endpoint carries - the description above all, but also the fee, the team caps and the
 * registration deadline - could sit 24 h behind an admin edit while the rest of the same snapshot
 * was fifteen minutes old. Rolling through a slice a run costs a few requests instead of 137 and
 * brings the whole map round in ceil(count/slice) runs.
 */
function ukp_details_to_refresh(array $ids, array $seen, int $slice): array {
  $missing = array_values(array_filter($ids, fn($id) => !isset($seen[$id])));
  $known = array_values(array_filter($ids, fn($id) => isset($seen[$id])));
  usort($known, fn($a, $b) => $seen[$a] <=> $seen[$b]);
  // A run that is already busy re-reading everything it has never seen does no rolling on top.
  return array_merge($missing, array_slice($known, 0, max(0, $slice - count($missing))));
}

/**
 * Whether this API build puts the description on the location list. Null fields are omitted from
 * the API's JSON, so the question can only be asked of the list as a whole: if no venue anywhere
 * has one, the list is treated as not carrying the field and the cached detail still speaks.
 */
function ukp_list_carries_descriptions(array $list): bool {
  foreach ($list as $l) if (trim((string)($l['description'] ?? '')) !== '') return true;
  return false;
}

/**
 * The venue blurb, preferring the list - which every run reads - over the cached detail. Once the
 * list is known to carry descriptions it is also authoritative about their absence, so a blurb
 * deleted in the admin leaves the site on the next run rather than lingering as a stale copy.
 */
function ukp_description(array $listRow, array $detail, bool $listCarriesDescriptions): ?string {
  $fromList = trim((string)($listRow['description'] ?? ''));
  if ($fromList !== '') return $fromList;
  if ($listCarriesDescriptions) return null;
  return trim((string)($detail['description'] ?? '')) ?: null;
}
