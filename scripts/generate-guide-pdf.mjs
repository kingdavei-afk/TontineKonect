import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { PDFDocument, rgb } from "pdf-lib";

const W = 1400;
const H = 1000;
const FONT = "Arial"; // fallback police système

// Couleurs de l'app (Tailwind)
const C = {
  orange500: { r: 0xef, g: 0x6c, b: 0x02 }, // approché
  orange600: { r: 0xea, g: 0x58, b: 0x0c },
  orange700: { r: 0xc2, g: 0x41, b: 0x06 },
  orange100: { r: 0xff, g: 0xed, b: 0xd5 },
  stone900: { r: 0x1c, g: 0x19, b: 0x17 },
  stone800: { r: 0x44, g: 0x40, b: 0x3c },
  stone700: { r: 0x44, g: 0x40, b: 0x3c },
  stone500: { r: 0x78, g: 0x71, b: 0x6c },
  stone400: { r: 0xa8, g: 0xa2, b: 0x9e },
  stone200: { r: 0xe7, g: 0xe5, b: 0xe4 },
  stone100: { r: 0xf5, g: 0xf5, b: 0xf4 },
  stone50:  { r: 0xfa, g: 0xfa, b: 0xf9 },
  stone600: { r: 0x63, g: 0x5f, b: 0x5a },
  white:    { r: 0xff, g: 0xff, b: 0xff },
  green600: { r: 0x16, g: 0xa3, b: 0x4a },
  green100: { r: 0xdc, g: 0xfc, b: 0xe7 },
  emerald600: { r: 0x05, g: 0x96, b: 0x69 },
  emerald100: { r: 0xd1, g: 0xfae, b: 0xe9 },
  red600:   { r: 0xdc, g: 0x26, b: 0x26 },
  amber100: { r: 0xfe, g: 0xf3, b: 0xc7 },
  amber800: { r: 0x9a, g: 0x67, b: 0x00 },
};

function px(c) { return `rgb(${c.r},${c.g},${c.b})`; }

async function textImg(text, opts = {}) {
  const { w = W, h = H, bg = C.white, color, size = 40, family = FONT, align = "left", x = 40, y = 40, weight } = opts;
  const svg = `
  <svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="${px(bg)}"/>
    ${(() => {
      // simple text as raw SVG text
      const parts = Array.isArray(text) ? text : [{ t: text, color, size, x, y, align, weight }];
      return parts.map(p => {
        const { t, size: s, color: col, x: xx, y: yy, align: al, weight: wl } = p;
        const fontWeight = wl ? `font-weight="${wl}"` : "";
        return `<text x="${xx}" y="${yy}" font-family="${family}" font-size="${s}" ${fontWeight} fill="${px(col??color ?? C.stone900)}" text-anchor="${al ?? "start"}">${escapeXml(t)}</text>`;
      }).join("\n    ");
    })()}
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

function escapeXml(s) {
  return String(s).replace(/[<>&'"]/g, ch => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[ch]));
}

// helpers pour composants d'UI simulés

async function captureHomepage() {
  // construire un SVG complexe
  const svg = `
  <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#f97316"/>
        <stop offset="1" stop-color="#ea580c"/>
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="#fafaf9"/>
    <rect x="0" y="0" width="100%" height="360" fill="url(#g)"/>
    <text x="60" y="60" font-family="${FONT}" font-size="18" fill="#fdba74" font-weight="700" letter-spacing="4">Abidjan · Côte d’Ivoire</text>
    <text x="60" y="110" font-family="${FONT}" font-size="64" fill="#ffffff" font-weight="800">Votre tontine, enfin bien organisée.</text>
    <text x="60" y="170" font-family="${FONT}" font-size="30" fill="#fed7aa">Créez votre tontine, invitez les membres par un code, suivez qui a payé, qui doit, et à qui revient le pot à chaque tour.</text>
    <text x="60" y="220" font-family="${FONT}" font-size="30" fill="#fed7aa">Fini les groupes WhatsApp et les cahiers perdus.</text>
    <rect x="60" y="270" width="320" height="64" rx="16" fill="#ffffff" stroke="#ffffff" stroke-width="1" opacity="0.9"/>
    <text x="80" y="308" font-family="${FONT}" font-size="22" fill="#c24106" font-weight="700">Créer ma tontine</text>
    <rect x="400" y="270" width="320" height="64" rx="16" fill="#ffffff" stroke="#ffffff" stroke-width="1" opacity="0.8"/>
    <text x="420" y="308" font-family="${FONT}" font-size="22" fill="#ffffff" font-weight="700">J’ai déjà un compte</text>

    <!-- features grid -->
    <rect x="60" y="420" width="390" height="170" rx="16" fill="#ffffff" stroke="${px(C.stone200)}" stroke-width="1"/>
    <text x="84" y="456" font-family="${FONT}" font-size="22" fill="${px(C.stone900)}" font-weight="700">Cotisations suivies</text>
    <text x="84" y="490" font-family="${FONT}" font-size="20" fill="${px(C.stone600)}">Le trésorier déclare chaque paiement (Wave, Orange Money, MTN, Moov ou espèces)</text>
    <text x="84" y="520" font-family="${FONT}" font-size="20" fill="${px(C.stone600)}">et tout le monde voit l’état en temps réel.</text>

    <rect x="490" y="420" width="390" height="170" rx="16" fill="#ffffff" stroke="${px(C.stone200)}" stroke-width="1"/>
    <text x="514" y="456" font-family="${FONT}" font-size="22" fill="${px(C.stone900)}" font-weight="700">Ordre des tours clair</text>
    <text x="514" y="490" font-family="${FONT}" font-size="20" fill="${px(C.stone600)}">Chaque membre a son tour de bénéficiaire, avec la date</text>
    <text x="514" y="520" font-family="${FONT}" font-size="20" fill="${px(C.stone600)}">d’échéance et le montant exact du pot.</text>

    <rect x="920" y="420" width="390" height="170" rx="16" fill="#ffffff" stroke="${px(C.stone200)}" stroke-width="1"/>
    <text x="944" y="456" font-family="${FONT}" font-size="22" fill="${px(C.stone900)}" font-weight="700">Rappels WhatsApp</text>
    <text x="944" y="490" font-family="${FONT}" font-size="20" fill="${px(C.stone600)}">Un clic pour envoyer un rappel poli aux retardataires,</text>
    <text x="944" y="520" font-family="${FONT}" font-size="20" fill="${px(C.stone600)}">directement dans WhatsApp.</text>

    <!-- footer -->
    <rect x="0" y="900" width="100%" height="100" fill="#ffffff" stroke="${px(C.stone100)}" stroke-width="1"/>
    <text x="60" y="955" font-family="${FONT}" font-size="20" fill="${px(C.stone500)}">Tontine Konect — MVP pour les tontines d’Abidjan. Les paiements sont déclarés manuellement par le trésorier.</text>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function captureLogin() {
  const svg = `
  <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#fafaf9"/>
    <!-- header -->
    <rect x="0" y="0" width="100%" height="80" fill="#ffffff" stroke="${px(C.stone200)}" stroke-width="1"/>
    <circle cx="60" cy="40" r="22" fill="${px(C.orange600)}"/>
    <circle cx="60" cy="40" r="10" fill="#ffffff"/>
    <text x="98" y="52" font-family="${FONT}" font-size="28" fill="${px(C.stone900)}" font-weight="800">Tontine <tspan fill="${px(C.orange600)}" font-weight="800">Konect</tspan></text>

    <!-- formulaire -->
    <rect x="300" y="220" width="800" height="520" rx="24" fill="#ffffff" stroke="${px(C.stone200)}" stroke-width="1"/>
    <text x="420" y="290" font-family="${FONT}" font-size="44" fill="${px(C.stone900)}" font-weight="800">Connexion</text>
    <text x="420" y="330" font-family="${FONT}" font-size="24" fill="${px(C.stone500)}">Votre numéro de téléphone + un code secret.</text>

    <rect x="420" y="372" width="560" height="64" rx="12" fill="#f5f5f4" stroke="${px(C.stone200)}" stroke-width="1"/>
    <text x="444" y="412" font-family="${FONT}" font-size="24" fill="${px(C.stone400)}">+225 07 07 00 11 22</text>
    <text x="420" y="430" font-family="${FONT}" font-size="16" fill="${px(C.stone400)}">Numéro de téléphone</text>

    <rect x="420" y="456" width="560" height="64" rx="12" fill="#f5f5f4" stroke="${px(C.stone200)}" stroke-width="1"/>
    <text x="444" y="496" font-family="${FONT}" font-size="24" fill="${px(C.stone400)}">••••</text>
    <text x="420" y="514" font-family="${FONT}" font-size="16" fill="${px(C.stone400)}">Code secret</text>

    <rect x="420" y="540" width="560" height="64" rx="12" fill="#ffffff" stroke="${px(C.stone200)}" stroke-width="1"/>
    <text x="444" y="580" font-family="${FONT}" font-size="24" fill="${px(C.stone500)}">Mot de passe</text>

    <rect x="420" y="624" width="560" height="64" rx="12" fill="${px(C.orange600)}"/>
    <text x="444" y="664" font-family="${FONT}" font-size="24" fill="#ffffff" font-weight="700">Se connecter</text>

    <text x="420" y="710" font-family="${FONT}" font-size="20" fill="${px(C.stone500)}">Pas encore de compte ?</text>
    <rect x="612" y="690" width="190" height="44" rx="12" fill="#ea580c"/>
    <text x="632" y="720" font-family="${FONT}" font-size="20" fill="#ffffff" font-weight="700">Créer un compte</text>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function captureDashboard() {
  const svg = `
  <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#fafaf9"/>
    <!-- header -->
    <rect x="0" y="0" width="100%" height="80" fill="#ffffff" stroke="${px(C.stone200)}" stroke-width="1"/>
    <circle cx="60" cy="40" r="22" fill="${px(C.orange600)}"/>
    <circle cx="60" cy="40" r="10" fill="#fdba74"/>
    <text x="98" y="52" font-family="${FONT}" font-size="28" fill="${px(C.stone900)}" font-weight="800">Tontine <tspan fill="${px(C.orange600)}" font-weight="800">Konect</tspan></text>
    <text x="360" y="52" font-family="${FONT}" font-size="18" fill="${px(C.stone500)}">Bonjour Alice 👋</text>
    <!-- nav -->
    <rect x="40" y="640" width="190" height="48" rx="10" fill="${px(C.stone100)}" stroke="${px(C.stone200)}" stroke-width="1"/>
    <text x="58" y="670" font-family="${FONT}" font-size="20" fill="${px(C.stone700)}" font-weight="600">Mes tontines</text>
    <rect x="244" y="640" width="190" height="48" rx="10" fill="${px(C.green100)}"/>
    <text x="262" y="670" font-family="${FONT}" font-size="20" fill="${px(C.green600)}" font-weight="600">🔔 Rappels actifs ✓</text>
    <text x="460" y="670" font-family="${FONT}" font-size="18" fill="${px(C.stone500)}">Alice Koffi</text>

    <!-- title -->
    <text x="60" y="150" font-family="${FONT}" font-size="44" fill="${px(C.stone900)}" font-weight="800">Bonjour Alice 👋</text>
    <text x="60" y="188" font-family="${FONT}" font-size="24" fill="${px(C.stone500)}">Vos tontines en cours.</text>
    <text x="60" y="214" font-family="${FONT}" font-size="18" fill="${px(C.orange700)}" font-weight="700">Mon compte</text>

    <!-- carte 1 -->
    <rect x="60" y="250" width="390" height="200" rx="16" fill="#ffffff" stroke="${px(C.stone200)}" stroke-width="1"/>
    <rect x="60" y="250" width="390" height="60" rx="16" fill="${px(C.orange100)}" stroke="none"/>
    <rect x="60" y="280" width="390" height="30" fill="${px(C.orange100)}"/>
    <text x="84" y="290" font-family="${FONT}" font-size="20" fill="${px(C.orange700)}" font-weight="700">En cours</text>
    <text x="84" y="332" font-family="${FONT}" font-size="26" fill="${px(C.stone900)}" font-weight="800">Tontine des voisines</text>
    <text x="84" y="368" font-family="${FONT}" font-size="22" fill="${px(C.stone700)}">50 000 F CFA / mensuel · 4 membres</text>
    <text x="84" y="404" font-family="${FONT}" font-size="22" fill="${px(C.stone500)}">Tour n°3 — échéance du 15/11/2025</text>

    <!-- carte 2 -->
    <rect x="480" y="250" width="390" height="200" rx="16" fill="#ffffff" stroke="${px(C.stone200)}" stroke-width="1"/>
    <rect x="480" y="250" width="390" height="60" rx="16" fill="${px(C.amber100)}" stroke="none"/>
    <rect x="480" y="280" width="390" height="30" fill="${px(C.amber100)}"/>
    <text x="504" y="290" font-family="${FONT}" font-size="20" fill="${px(C.amber800)}" font-weight="700">En retard</text>
    <text x="504" y="332" font-family="${FONT}" font-size="26" fill="${px(C.stone900)}" font-weight="800">Tontine famille</text>
    <text x="504" y="368" font-family="${FONT}" font-size="22" fill="${px(C.stone700)}">100 000 F CFA / mensuel · 5 membres</text>
    <text x="504" y="404" font-family="${FONT}" font-size="22" fill="${px(C.red600)}" font-weight="700">Tour n°2 — échéance du 05/11/2025 · EN RETARD</text>

    <!-- carte 3 -->
    <rect x="900" y="250" width="390" height="200" rx="16" fill="#ffffff" stroke="${px(C.stone200)}" stroke-width="1"/>
    <rect x="900" y="250" width="390" height="60" rx="16" fill="${px(C.green100)}" stroke="none"/>
    <rect x="900" y="280" width="390" height="30" fill="${px(C.green100)}"/>
    <text x="924" y="290" font-family="${FONT}" font-size="20" fill="${px(C.green600)}" font-weight="700">Clôturée</text>
    <text x="924" y="332" font-family="${FONT}" font-size="26" fill="${px(C.stone900)}" font-weight="800">Tontine voisins Nord</text>
    <text x="924" y="368" font-family="${FONT}" font-size="22" fill="${px(C.stone700)}">75 000 F CFA / mensuel · 6 membres</text>
    <text x="924" y="404" font-family="${FONT}" font-size="22" fill="${px(C.stone500)}">Tous les tours terminés 🎉 — lecture seule</text>

    <!-- boutons create / join -->
    <rect x="60" y="490" width="390" height="140" rx="16" fill="#ffffff" stroke="${px(C.stone200)}" stroke-width="1"/>
    <text x="84" y="522" font-family="${FONT}" font-size="22" fill="${px(C.stone900)}" font-weight="700">Créer une tontine</text>
    <text x="84" y="544" font-family="${FONT}" font-size="20" fill="${px(C.stone500)}">Montant, fréquence, date de début</text>
    <rect x="84" y="562" width="370" height="52" rx="12" fill="#fafaf9" stroke="${px(C.stone200)}" stroke-width="1"/>
    <text x="100" y="594" font-family="${FONT}" font-size="18" fill="${px(C.stone400)}">2025-12-01</text>

    <rect x="480" y="490" width="390" height="140" rx="16" fill="#ffffff" stroke="${px(C.stone200)}" stroke-width="1"/>
    <text x="504" y="522" font-family="${FONT}" font-size="22" fill="${px(C.stone900)}" font-weight="700">Rejoindre avec un code</text>
    <text x="504" y="544" font-family="${FONT}" font-size="20" fill="${px(C.stone500)}">Demandez le code au trésorier.</text>
    <rect x="504" y="562" width="370" height="52" rx="12" fill="#fafaf9" stroke="${px(C.stone200)}" stroke-width="1"/>
    <text x="520" y="594" font-family="${FONT}" font-size="18" fill="${px(C.stone400)}">Code d’invitation</text>

    <!-- footer -->
    <rect x="0" y="900" width="100%" height="100" fill="#ffffff" stroke="${px(C.stone100)}" stroke-width="1"/>
    <text x="60" y="955" font-family="${FONT}" font-size="18" fill="${px(C.stone500)}">Tontine Konect — MVP pour les tontines d’Abidjan.</text>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function captureDetail() {
  const svg = `
  <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#fafaf9"/>
    <!-- header -->
    <rect x="0" y="0" width="100%" height="80" fill="#ffffff" stroke="${px(C.stone200)}" stroke-width="1"/>
    <circle cx="60" cy="40" r="22" fill="${px(C.orange600)}"/>
    <circle cx="60" cy="40" r="10" fill="#fdba74"/>
    <text x="98" y="52" font-family="${FONT}" font-size="28" fill="${px(C.stone900)}" font-weight="800">Tontine <tspan fill="${px(C.orange600)}" font-weight="800">Konect</tspan></text>

    <!-- back link -->
    <text x="60" y="150" font-family="${FONT}" font-size="20" fill="${px(C.stone500)}">← Mes tontines</text>

    <!-- fiche -->
    <text x="60" y="230" font-family="${FONT}" font-size="44" fill="${px(C.stone900)}" font-weight="800">Tontine famille</text>
    <text x="60" y="264" font-family="${FONT}" font-size="22" fill="${px(C.stone500)}">100 000 F CFA par cotisation · mensuel · début le 01/10/2025 · vous êtes trésorier</text>

    <!-- code invité -->
    <rect x="840" y="180" width="200" height="52" rx="8" fill="#1c1917"/>
    <text x="864" y="212" font-family="monospace" font-size="24" fill="#ffffff" font-weight="700">TK-2F9A3C</text>

    <!-- KPI -->
    <rect x="60" y="300" width="270" height="110" rx="12" fill="#ffffff" stroke="${px(C.stone200)}" stroke-width="1"/>
    <text x="80" y="328" font-family="${FONT}" font-size="16" fill="${px(C.stone400)}" font-weight="700" letter-spacing="2">POT DU TOUR</text>
    <text x="80" y="368" font-family="${FONT}" font-size="30" fill="${px(C.stone900)}" font-weight="800">500 000 F</text>

    <rect x="350" y="300" width="270" height="110" rx="12" fill="#ffffff" stroke="${px(C.stone200)}" stroke-width="1"/>
    <text x="370" y="328" font-family="${FONT}" font-size="16" fill="${px(C.stone400)}" font-weight="700" letter-spacing="2">MEMBRES ACTIVES</text>
    <text x="370" y="368" font-family="${FONT}" font-size="30" fill="${px(C.stone900)}" font-weight="800">4 / 5</text>

    <rect x="640" y="300" width="270" height="110" rx="12" fill="#ffffff" stroke="${px(C.stone200)}" stroke-width="1"/>
    <text x="660" y="328" font-family="${FONT}" font-size="16" fill="${px(C.stone400)}" font-weight="700" letter-spacing="2">TOUR EN COURS</text>
    <text x="660" y="368" font-family="${FONT}" font-size="30" fill="${px(C.stone900)}" font-weight="800">2 / 5</text>

    <rect x="930" y="300" width="270" height="110" rx="12" fill="#ffffff" stroke="${px(C.stone200)}" stroke-width="1"/>
    <text x="950" y="328" font-family="${FONT}" font-size="16" fill="${px(C.stone400)}" font-weight="700" letter-spacing="2">MES COTISATIONS</text>
    <text x="950" y="368" font-family="${FONT}" font-size="30" fill="${px(C.stone900)}" font-weight="800">3 · 300 000 F</text>

    <!-- tour -->
    <rect x="60" y="440" width="1240" height="170" rx="16" fill="#ffffff" stroke="${px(C.stone200)}" stroke-width="1"/>
    <text x="84" y="476" font-family="${FONT}" font-size="16" fill="${px(C.stone400)}" font-weight="700" letter-spacing="2">TOUR N°2 — BÉNÉFICIAIRE</text>
    <text x="84" y="510" font-family="${FONT}" font-size="32" fill="${px(C.stone900)}" font-weight="800">Maman Aya <tspan font-size="22" font-weight="600" fill="${px(C.stone500)}">(vous 🎉)</tspan></text>
    <text x="84" y="544" font-family="${FONT}" font-size="22" fill="${px(C.stone600)}">Cotisation de ce tour : <tspan font-weight="700">100 000 F CFA</tspan> · pot à verser <tspan font-weight="700">500 000 F</tspan> · échéance du <tspan font-weight="700" fill="${px(C.red600)}">05/11/2025</tspan></text>
    <text x="84" y="572" font-family="${FONT}" font-size="22" fill="${px(C.red600)}" font-weight="700">EN RETARD</text>

    <!-- statut pot -->
    <rect x="1076" y="460" width="200" height="60" rx="10" fill="${px(C.emerald100)}"/>
    <text x="1096" y="496" font-family="${FONT}" font-size="20" fill="${px(C.emerald600)}" font-weight="700">✅ Pot reçu le 03/11</text>

    <!-- barre progression -->
    <rect x="84" y="630" width="1240" height="22" rx="11" fill="${px(C.stone100)}"/>
    <rect x="84" y="630" width="620" height="22" rx="11" fill="${px(C.orange600)}"/>
    <text x="84" y="662" font-family="${FONT}" font-size="18" fill="${px(C.stone500)}">3 / 5 cotisations reçues (300 000 F encaissés)</text>

    <!-- tableau -->
    <rect x="84" y="700" width="1240" height="2" fill="${px(C.stone200)}"/>
    <text x="84" y="730" font-family="${FONT}" font-size="14" fill="${px(C.stone400)}" font-weight="700" letter-spacing="2">TOUR</text>
    <text x="260" y="730" font-family="${FONT}" font-size="14" fill="${px(C.stone400)}" font-weight="700" letter-spacing="2">MEMBRE</text>
    <text x="640" y="730" font-family="${FONT}" font-size="14" fill="${px(C.stone400)}" font-weight="700" letter-spacing="2">STATUT</text>
    <text x="940" y="730" font-family="${FONT}" font-size="14" fill="${px(C.stone400)}" font-weight="700" letter-spacing="2">ACTION</text>
    <rect x="60" y="740" width="1240" height="56" rx="8" fill="${px(C.stone50)}"/>
    <text x="84" y="772" font-family="monospace" font-size="18" fill="${px(C.stone500)}">02</text>
    <text x="260" y="772" font-family="${FONT}" font-size="20" fill="${px(C.stone800)}" font-weight="600">Maman Aya <tspan fill="${px(C.orange700)}" font-size="16">(vous)</tspan></text>
    <text x="640" y="772" font-family="${FONT}" font-size="20" fill="${px(C.orange700)}" font-weight="700">Payé · Wave</text>

    <rect x="60" y="800" width="360" height="48" rx="8" fill="${px(C.orange600)}"/>
    <text x="80" y="830" font-family="${FONT}" font-size="20" fill="#ffffff" font-weight="700">Valider</text>

    <rect x="430" y="800" width="360" height="48" rx="8" fill="${px(C.stone100)}" stroke="${px(C.stone200)}" stroke-width="1"/>
    <text x="450" y="830" font-family="${FONT}" font-size="18" fill="${px(C.stone600)}" font-weight="600">Annuler</text>

    <rect x="810" y="800" width="490" height="48" rx="8" fill="${px(C.stone100)}" stroke="${px(C.stone200)}" stroke-width="1"/>
    <text x="828" y="830" font-family="${FONT}" font-size="18" fill="${px(C.stone600)}" font-weight="600">Mot de passe</text>

    <!-- footer -->
    <rect x="0" y="880" width="100%" height="40" fill="#ffffff" stroke="${px(C.stone100)}" stroke-width="1"/>
    <text x="60" y="908" font-family="${FONT}" font-size="16" fill="${px(C.stone500)}">Tontine Konect — MVP pour les tontines d’Abidjan.</text>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function captureAudit() {
  const svg = `
  <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#fafaf9"/>
    <!-- header -->
    <rect x="0" y="0" width="100%" height="80" fill="#ffffff" stroke="${px(C.stone200)}" stroke-width="1"/>
    <circle cx="60" cy="40" r="22" fill="${px(C.orange600)}"/>
    <circle cx="60" cy="40" r="10" fill="#fdba74"/>
    <text x="98" y="52" font-family="${FONT}" font-size="28" fill="${px(C.stone900)}" font-weight="800">Tontine <tspan fill="${px(C.orange600)}" font-weight="800">Konect</tspan></text>

    <!-- back -->
    <text x="60" y="150" font-family="${FONT}" font-size="20" fill="${px(C.stone500)}">← Mes tontines</text>

    <!-- titre section -->
    <text x="60" y="210" font-family="${FONT}" font-size="36" fill="${px(C.stone900)}" font-weight="800">Journal d’audit</text>
    <text x="60" y="240" font-family="${FONT}" font-size="22" fill="${px(C.stone500)}">Qui a validé quoi, quand et avec quel mode — 50 dernières opérations.</text>

    <!-- lignes audit -->
    <rect x="60" y="280" width="1240" height="60" rx="10" fill="${px(C.stone50)}" stroke="${px(C.stone200)}" stroke-width="1"/>
    <rect x="84" y="292" width="360" height="40" rx="6" fill="${px(C.orange100)}"/>
    <text x="100" y="316" font-family="${FONT}" font-size="18" fill="${px(C.orange700)}" font-weight="700">Cotisation validée</text>
    <text x="480" y="316" font-family="${FONT}" font-size="18" fill="${px(C.stone700)}">Par Alice · +225 07 07 00 11 22</text>
    <text x="1000" y="316" font-family="${FONT}" font-size="18" fill="${px(C.stone500)}">15/10/2025 à 14:32</text>

    <rect x="60" y="350" width="1240" height="60" rx="10" fill="${px(C.stone50)}" stroke="${px(C.stone200)}" stroke-width="1"/>
    <rect x="84" y="362" width="360" height="40" rx="6" fill="${px(C.emerald100)}"/>
    <text x="100" y="386" font-family="${FONT}" font-size="18" fill="${px(C.emerald600)}" font-weight="700">Pot versé</text>
    <text x="480" y="386" font-family="${FONT}" font-size="18" fill="${px(C.stone700)}">Par Alice · +225 07 07 00 11 22</text>
    <text x="1000" y="386" font-family="${FONT}" font-size="18" fill="${px(C.stone500)}">12/10/2025 à 09:45 · Wave</text>

    <rect x="60" y="420" width="1240" height="60" rx="10" fill="${px(C.stone50)}" stroke="${px(C.stone200)}" stroke-width="1"/>
    <rect x="84" y="432" width="360" height="40" rx="6" fill="${px(C.amber100)}"/>
    <text x="100" y="456" font-family="${FONT}" font-size="18" fill="${px(C.amber800)}" font-weight="700">Contribution annulée</text>
    <text x="480" y="456" font-family="${FONT}" font-size="18" fill="${px(C.stone700)}">Par Alice · +225 07 07 00 11 22</text>
    <text x="1000" y="456" font-family="${FONT}" font-size="18" fill="${px(C.stone500)}">20/10/2025 à 16:20</text>

    <rect x="60" y="490" width="1240" height="60" rx="10" fill="${px(C.stone50)}" stroke="${px(C.stone200)}" stroke-width="1"/>
    <rect x="84" y="502" width="360" height="40" rx="6" fill="${px(C.orange100)}"/>
    <text x="100" y="526" font-family="${FONT}" font-size="18" fill="${px(C.orange700)}" font-weight="700">Cotisation validée</text>
    <text x="480" y="526" font-family="${FONT}" font-size="18" fill="${px(C.stone700)}">Par Kévin · +225 05 05 00 22 33</text>
    <text x="1000" y="526" font-family="${FONT}" font-size="18" fill="${px(C.stone500)}">15/10/2025 à 18:10 · Orange Money</text>

    <!-- footer -->
    <rect x="0" y="880" width="100%" height="100" fill="#ffffff" stroke="${px(C.stone100)}" stroke-width="1"/>
    <text x="60" y="935" font-family="${FONT}" font-size="18" fill="${px(C.stone500)}">Tontine Konect — MVP pour les tontines d’Abidjan.</text>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function captureExports() {
  const svg = `
  <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#fafaf9"/>
    <!-- header -->
    <rect x="0" y="0" width="100%" height="80" fill="#ffffff" stroke="${px(C.stone200)}" stroke-width="1"/>
    <circle cx="60" cy="40" r="22" fill="${px(C.orange600)}"/>
    <circle cx="60" cy="40" r="10" fill="#fdba74"/>
    <text x="98" y="52" font-family="${FONT}" font-size="28" fill="${px(C.stone900)}" font-weight="800">Tontine <tspan fill="${px(C.orange600)}" font-weight="800">Konect</tspan></text>

    <text x="60" y="150" font-family="${FONT}" font-size="20" fill="${px(C.stone500)}">← Mes tontines</text>

    <text x="60" y="210" font-family="${FONT}" font-size="36" fill="${px(C.stone900)}" font-weight="800">Exporter les données (CSV)</text>
    <text x="60" y="240" font-family="${FONT}" font-size="22" fill="${px(C.stone500)}">Fichiers compatibles Excel et Google Sheets (séparateur « ; », accents conservés).</text>

    <!-- boutons exports -->
    <rect x="60" y="300" width="530" height="60" rx="12" fill="#ffffff" stroke="${px(C.stone200)}" stroke-width="1"/>
    <text x="84" y="338" font-family="${FONT}" font-size="22" fill="${px(C.stone700)}" font-weight="600">⬇ Cotisations (CSV)</text>

    <rect x="620" y="300" width="530" height="60" rx="12" fill="#ffffff" stroke="${px(C.stone200)}" stroke-width="1"/>
    <text x="644" y="338" font-family="${FONT}" font-size="22" fill="${px(C.stone700)}" font-weight="600">⬇ Journal d’audit (CSV)</text>

    <rect x="60" y="390" width="530" height="60" rx="12" fill="#ffffff" stroke="${px(C.stone200)}" stroke-width="1"/>
    <text x="84" y="428" font-family="${FONT}" font-size="22" fill="${px(C.stone700)}" font-weight="600">⬇ Membres (CSV)</text>

    <rect x="620" y="390" width="530" height="60" rx="12" fill="#ffffff" stroke="${px(C.stone200)}" stroke-width="1"/>
    <text x="644" y="428" font-family="${FONT}" font-size="22" fill="${px(C.stone700)}" font-weight="600">⬇ Remboursements (CSV)</text>

    <!-- members list miniature -->
    <rect x="60" y="490" width="1240" height="330" rx="12" fill="#ffffff" stroke="${px(C.stone200)}" stroke-width="1"/>
    <text x="84" y="526" font-family="${FONT}" font-size="24" fill="${px(C.stone900)}" font-weight="800">Membres (4 actifs · 1 parti)</text>
    <rect x="84" y="552" width="1200" height="460" rx="8" fill="${px(C.stone50)}"/>
    <text x="104" y="586" font-family="${FONT}" font-size="20" fill="${px(C.stone800)}" font-weight="600">01. Alice Koffi</text>
    <text x="104" y="612" font-family="${FONT}" font-size="18" fill="${px(C.stone500)}">+225 07 07 00 11 22 · inscrit</text>
    <rect x="1120" y="578" width="130" height="44" rx="8" fill="${px(C.orange100)}"/>
    <text x="1136" y="604" font-family="${FONT}" font-size="16" fill="${px(C.orange700)}" font-weight="700">Trésorier</text>

    <text x="104" y="660" font-family="${FONT}" font-size="20" fill="${px(C.stone800)}" font-weight="600">02. Kévin Koné</text>
    <text x="104" y="686" font-family="${FONT}" font-size="18" fill="${px(C.stone500)}">+225 05 05 00 22 33 · inscrit</text>

    <text x="104" y="734" font-family="${FONT}" font-size="20" fill="${px(C.stone800)}" font-weight="600">03. Maman Aya</text>
    <text x="104" y="760" font-family="${FONT}" font-size="18" fill="${px(C.stone500)}">+225 07 07 00 33 44 · inscrit</text>

    <text x="104" y="808" font-family="${FONT}" font-size="20" fill="${px(C.stone800)}" font-weight="600">04. Fatou B.</text>
    <text x="104" y="834" font-family="${FONT}" font-size="18" fill="${px(C.stone500)}">+225 07 07 00 44 55 · inscrit</text>

    <text x="104" y="882" font-family="${FONT}" font-size="20" fill="${px(C.stone800)}" font-weight="600">05. Ibrahim</text>
    <text x="104" y="908" font-family="${FONT}" font-size="18" fill="${px(C.stone500)}">+225 05 05 00 55 66 · parti</text>
    <rect x="1110" y="886" width="110" height="40" rx="8" fill="${px(C.stone200)}"/>
    <text x="1124" y="910" font-family="${FONT}" font-size="14" fill="${px(C.stone600)}" font-weight="700">parti</text>

    <!-- footer -->
    <rect x="0" y="880" width="100%" height="40" fill="#ffffff" stroke="${px(C.stone100)}" stroke-width="1"/>
    <text x="60" y="908" font-family="${FONT}" font-size="16" fill="${px(C.stone500)}">Tontine Konect — MVP pour les tontines d’Abidjan.</text>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function captureCover() {
  const svg = `
  <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#f97316"/>
        <stop offset="1" stop-color="#ea580c"/>
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="#f97316"/>
    <circle cx="256" cy="116" r="34" fill="#fdba74"/>
    <path d="M321.7 132.4 A140 140 0 1 1 190.3 132.4" fill="none" stroke="#ffffff" stroke-width="44" stroke-linecap="round"/>
    <rect x="0" y="0" width="100%" height="100%" fill="url(#g)" opacity="0.35"/>

    <text x="60" y="200" font-family="${FONT}" font-size="28" fill="#ffffff" letter-spacing="4" font-weight="700" opacity="0.9">TONTINE KONECT</text>
    <text x="60" y="320" font-family="${FONT}" font-size="80" fill="#ffffff" font-weight="800">Guide de prise en main</text>
    <text x="60" y="400" font-family="${FONT}" font-size="36" fill="#fed7aa">Gérez votre tontine à Abidjan : cotisations,</text>
    <text x="60" y="440" font-family="${FONT}" font-size="36" fill="#fed7aa">tours, rappels WhatsApp.</text>
    <text x="60" y="540" font-family="${FONT}" font-size="30" fill="#ffffff">Ce guide explique pas à pas comment utiliser l’application,</text>
    <text x="60" y="576" font-family="${FONT}" font-size="30" fill="#ffffff">avec des captures d’écran de chaque écran clé.</text>
    <rect x="60" y="640" width="600" height="64" rx="14" fill="#ffffff"/>
    <text x="84" y="680" font-family="${FONT}" font-size="28" fill="#c24106" font-weight="700">Commencer la lecture ↓</text>
    <text x="60" y="760" font-family="${FONT}" font-size="24" fill="#ffffff" opacity="0.9">Version 1.0 · Octobre 2025</text>
    <text x="60" y="940" font-family="${FONT}" font-size="22" fill="#fed7aa" opacity="0.9">Tontine Konect — simples, fiables, pour Abidjan.</text>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function captureWhatsAppReminder() {
  const svg = `
  <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#f0f2f5"/>
    <rect x="0" y="0" width="100%" height="100%" fill="#ffffff"/>
    <!-- signal bar -->
    <rect x="20" y="20" width="4" height="12" fill="${px(C.stone400)}"/>
    <rect x="30" y="14" width="4" height="18" fill="${px(C.stone400)}"/>
    <rect x="40" y="8" width="4" height="24" fill="${px(C.stone400)}"/>
    <rect x="50" y="4" width="4" height="28" fill="${px(C.stone400)}"/>

    <text x="100" y="40" font-family="${FONT}" font-size="18" fill="${px(C.stone400)}">Rappel WhatsApp</text>

    <!-- bubble de message -->
    <rect x="40" y="70" width="900" height="120" rx="10" fill="${px(C.stone100)}"/>
    <text x="60" y="106" font-family="${FONT}" font-size="22" fill="${px(C.stone900)}" font-weight="600">Bonjour Fatou B. 👋</text>
    <text x="60" y="136" font-family="${FONT}" font-size="20" fill="${px(C.stone600)}">Rappel : ta cotisation de 100 000 F CFA pour la tontine</text>
    <text x="60" y="162" font-family="${FONT}" font-size="20" fill="${px(C.stone600)}">“Tontine famille” est due le 05/11/2025. Merci !</text>

    <!-- boutons rappel -->
    <rect x="40" y="220" width="220" height="48" rx="10" fill="${px(C.emerald100)}" stroke="${px(C.stone200)}" stroke-width="1"/>
    <text x="60" y="250" font-family="${FONT}" font-size="20" fill="${px(C.emerald600)}" font-weight="700">Rappeler Fatou</text>

    <rect x="280" y="220" width="220" height="48" rx="10" fill="${px(C.stone100)}" stroke="${px(C.stone200)}" stroke-width="1"/>
    <text x="300" y="250" font-family="${FONT}" font-size="20" fill="${px(C.stone600)}" font-weight="600">Copier le lien</text>

    <rect x="520" y="220" width="220" height="48" rx="10" fill="${px(C.stone100)}" stroke="${px(C.stone200)}" stroke-width="1"/>
    <text x="540" y="250" font-family="${FONT}" font-size="20" fill="${px(C.stone600)}" font-weight="600">Envoyer par SMS</text>

    <!-- info -->
    <rect x="40" y="300" width="900" height="60" rx="10" fill="${px(C.green100)}"/>
    <text x="60" y="330" font-family="${FONT}" font-size="20" fill="${px(C.green600)}" font-weight="700">🔔 Rappels push : Fatou a activé les notifications</text>
    <text x="60" y="356" font-family="${FONT}" font-size="20" fill="${px(C.stone600)}">Elle recevra automatiquement un rappel à J-2 et le jour de l’échéance.</text>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function main() {
  const outDir = path.resolve(process.cwd(), "public");
  fs.mkdirSync(outDir, { recursive: true });

  const pdfDoc = await PDFDocument.create();
  const pages = [];

  const captures = {
    cover: await captureCover(),
    homepage: await captureHomepage(),
    login: await captureLogin(),
    dashboard: await captureDashboard(),
    detail: await captureDetail(),
    audit: await captureAudit(),
    exports: await captureExports(),
    whatsapp: await captureWhatsAppReminder(),
  };

  // page de garde
  const coverImg = await pdfDoc.embedPng(captures.cover);
  let page = pdfDoc.addPage([W, H]);
  page.drawImage(coverImg, {
    x: 0, y: 0, width: W, height: H,
  });
  pages.push(page);

  // page d'accueil
  const homeImg = await pdfDoc.embedPng(captures.homepage);
  page = pdfDoc.addPage([W, H]);
  page.drawImage(homeImg, { x: 0, y: 0, width: W, height: H });
  pages.push(page);

  // login
  const loginImg = await pdfDoc.embedPng(captures.login);
  page = pdfDoc.addPage([W, H]);
  page.drawImage(loginImg, { x: 0, y: 0, width: W, height: H });
  pages.push(page);

  // dashboard
  const dashImg = await pdfDoc.embedPng(captures.dashboard);
  page = pdfDoc.addPage([W, H]);
  page.drawImage(dashImg, { x: 0, y: 0, width: W, height: H });
  pages.push(page);

  // fiche tontine
  const detailImg = await pdfDoc.embedPng(captures.detail);
  page = pdfDoc.addPage([W, H]);
  page.drawImage(detailImg, { x: 0, y: 0, width: W, height: H });
  pages.push(page);

  // audit
  const auditImg = await pdfDoc.embedPng(captures.audit);
  page = pdfDoc.addPage([W, H]);
  page.drawImage(auditImg, { x: 0, y: 0, width: W, height: H });
  pages.push(page);

  // exports
  const exportsImg = await pdfDoc.embedPng(captures.exports);
  page = pdfDoc.addPage([W, H]);
  page.drawImage(exportsImg, { x: 0, y: 0, width: W, height: H });
  pages.push(page);

  // rappel WhatsApp
  const waImg = await pdfDoc.embedPng(captures.whatsapp);
  page = pdfDoc.addPage([W, H]);
  page.drawImage(waImg, { x: 0, y: 0, width: W, height: H });
  pages.push(page);

  // Télécharger
  const pdfBytes = await pdfDoc.save();
  const outPath = path.join(outDir, "guide-tontinekonect.pdf");
  fs.writeFileSync(outPath, pdfBytes);
  console.log("PDF généré :", outPath, `(${(pdfBytes.length/1024).toFixed(1)} ko)`);
}

main().catch(err => { console.error(err); process.exit(1); });
