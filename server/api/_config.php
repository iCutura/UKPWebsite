<?php
// Shared config loader for the PHP endpoints. kvizovi.hr/ukp-config.php lives outside the web
// root; deploy.sh writes it from .env. Separate from _common.php so an HTML endpoint can load
// the config without _common.php forcing JSON headers on the response.
declare(strict_types=1);
function ukp_config(): array {
  $f = dirname(__DIR__, 2) . '/ukp-config.php';
  if (!is_file($f)) { http_response_code(500); exit('Poslužitelj nije konfiguriran.'); }
  return require $f;
}
