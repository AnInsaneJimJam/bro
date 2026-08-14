const countryCodes =
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(
    ' '
  );

const defaultTimeZones: Record<string, string> = {
  AE: 'Asia/Dubai',
  AR: 'America/Argentina/Buenos_Aires',
  AT: 'Europe/Vienna',
  AU: 'Australia/Sydney',
  BD: 'Asia/Dhaka',
  BE: 'Europe/Brussels',
  BR: 'America/Sao_Paulo',
  CA: 'America/Toronto',
  CH: 'Europe/Zurich',
  CL: 'America/Santiago',
  CN: 'Asia/Shanghai',
  CO: 'America/Bogota',
  CZ: 'Europe/Prague',
  DE: 'Europe/Berlin',
  DK: 'Europe/Copenhagen',
  EG: 'Africa/Cairo',
  ES: 'Europe/Madrid',
  FI: 'Europe/Helsinki',
  FR: 'Europe/Paris',
  GB: 'Europe/London',
  GR: 'Europe/Athens',
  HK: 'Asia/Hong_Kong',
  ID: 'Asia/Jakarta',
  IE: 'Europe/Dublin',
  IL: 'Asia/Jerusalem',
  IN: 'Asia/Kolkata',
  IT: 'Europe/Rome',
  JP: 'Asia/Tokyo',
  KE: 'Africa/Nairobi',
  KR: 'Asia/Seoul',
  LK: 'Asia/Colombo',
  MX: 'America/Mexico_City',
  MY: 'Asia/Kuala_Lumpur',
  NG: 'Africa/Lagos',
  NL: 'Europe/Amsterdam',
  NO: 'Europe/Oslo',
  NP: 'Asia/Katmandu',
  NZ: 'Pacific/Auckland',
  PH: 'Asia/Manila',
  PK: 'Asia/Karachi',
  PL: 'Europe/Warsaw',
  PT: 'Europe/Lisbon',
  RU: 'Europe/Moscow',
  SA: 'Asia/Riyadh',
  SE: 'Europe/Stockholm',
  SG: 'Asia/Singapore',
  TH: 'Asia/Bangkok',
  TR: 'Europe/Istanbul',
  TW: 'Asia/Taipei',
  UA: 'Europe/Kyiv',
  US: 'America/New_York',
  VN: 'Asia/Ho_Chi_Minh',
  ZA: 'Africa/Johannesburg',
};

const displayNames = new Intl.DisplayNames(['en'], { type: 'region' });

export type CountryOption = {
  code: string;
  name: string;
  zone: string;
};

export const countries: CountryOption[] = countryCodes
  .map((code) => ({
    code,
    name: displayNames.of(code) || code,
    zone: defaultTimeZones[code] || 'UTC',
  }))
  .sort((left, right) => left.name.localeCompare(right.name, 'en'));
