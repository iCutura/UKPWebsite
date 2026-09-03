<?php
declare(strict_types=1);
require __DIR__ . '/_common.php';
$cfg = ukp_config();
$d = ukp_input();
ukp_throttle('kontakt', 5, 600);

$ime = ukp_str($d, 'ime', 80); $email = ukp_str($d, 'email', 120); $poruka = ukp_str($d, 'poruka', 3000); $tema = ukp_str($d, 'tema', 40);
if ($ime === '' || $poruka === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) ukp_fail(422, 'Ispuni ime, ispravan e-mail i poruku.');
if (preg_match('/[\r\n]/', $ime . $email)) ukp_fail(422, 'Neispravan unos.');
$teme = ['opcenito' => 'Općenito', 'team-building' => 'Team building', 'partnerstvo' => 'Partnerstvo', 'kviz-u-mom-gradu' => 'Kviz u mom gradu', 'mediji' => 'Mediji'];
$temaLabel = $teme[$tema] ?? 'Općenito';

$subject = "=?UTF-8?B?" . base64_encode("[kvizovi.hr] {$temaLabel}: {$ime}") . "?=";
$body = "Tema: {$temaLabel}\nIme: {$ime}\nE-mail: {$email}\nIP: " . ($_SERVER['REMOTE_ADDR'] ?? '') . "\n\n{$poruka}\n";
$headers = "From: Urbana kviz priča <{$cfg['mail_from']}>\r\nReply-To: {$ime} <{$email}>\r\nContent-Type: text/plain; charset=UTF-8\r\nX-Mailer: kvizovi.hr";
$ok = @mail($cfg['mail_to'], $subject, $body, $headers);
if (!$ok) ukp_fail(500, 'Slanje trenutno ne radi. Piši nam izravno na ' . $cfg['mail_to'] . '.');
echo json_encode(['ok' => true, 'message' => 'Hvala! Poruka je poslana, javljamo se uskoro.'], JSON_UNESCAPED_UNICODE);
