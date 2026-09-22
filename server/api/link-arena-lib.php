<?php
declare(strict_types=1);
/**
 * The arena invite landing's decisions, kept out of link.php so a test can require them without
 * the script running against the live API. Exercised by tests/unit/link-arena.test.ts.
 *
 * A private Arena match code is six characters from an alphabet without 0, O, 1 and I, minted by
 * the PubQuiz API. The link is public, so anything that is not exactly that shape is answered as
 * "no such match" before the API is asked.
 */

const UKP_ARENA_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** The code as the apps generate it, or null when the input is not exactly six safe characters. */
function ukp_arena_code(string $raw): ?string {
  $code = strtoupper(trim($raw));
  if (strlen($code) !== 6) return null;
  return strspn($code, UKP_ARENA_CODE_ALPHABET) === 6 ? $code : null;
}

/** The mode as the apps show it in Croatian; an unknown mode is shown as the API sent it. */
function ukp_arena_mode_label(string $mode): string {
  $labels = ['Classic' => 'Klasik', 'FirstStrike' => 'Prvi udarac', 'Gladiator' => 'Gladijator'];
  return $labels[$mode] ?? $mode;
}

/**
 * Title, description and HTTP status for the landing page, from the API's match preview
 * ({mode, hostNickname, playerCount, maxPlayers, questionCount, status}) or null when there is
 * none. Question counts are 5, 10, 15 or 20, so "pitanja" is always the right form.
 */
function ukp_arena_copy(?array $match): array {
  if ($match === null) {
    return [
      'status' => 404,
      'title' => 'Ova poveznica za meč ne vrijedi',
      'desc' => 'Meč ne postoji, završio je ili je poveznica istekla. Zamoli domaćina za novu.',
    ];
  }
  $host = trim((string)($match['hostNickname'] ?? ''));
  $mode = ukp_arena_mode_label((string)($match['mode'] ?? ''));
  $players = (int)($match['playerCount'] ?? 0);
  $max = (int)($match['maxPlayers'] ?? 0);
  $questions = (int)($match['questionCount'] ?? 0);
  $invite = $host !== '' ? "$host te poziva na" : 'Poziv na';
  $tail = (string)($match['status'] ?? '') === 'Live'
    ? 'Meč je u tijeku: otvori aplikaciju i pričekaj revanš.'
    : 'Otvori UKP Quiz aplikaciju i uđi kodom.';
  return [
    'status' => 200,
    'title' => 'Pridruži se privatnom Arena meču',
    'desc' => "$invite $mode meč: $players/$max igrača, $questions pitanja. $tail",
  ];
}
