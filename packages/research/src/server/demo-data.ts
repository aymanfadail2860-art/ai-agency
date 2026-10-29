import type { CompanyInput } from "@agency/core/server";

/**
 * DEMO-DATA — FIKTIVE VIRKSOMHEDER
 * --------------------------------
 * Alt i denne fil er opdigtet og må kun bruges i Demo Mode. Domæner bruger
 * det reserverede `.example`-topdomæne, og CVR-numrene (00000001-00000003)
 * er bevidst ugyldige, så de aldrig kan forveksles med rigtige virksomheder.
 * Demo-pipelinen kører de samme analysetrin som Live Mode — kun datakilderne
 * er udskiftet.
 */

export interface DemoSearchItem {
  kind: "jobs" | "reviews" | "news" | "social";
  title: string;
  url: string;
  text: string;
}

export interface DemoCompetitor {
  name: string;
  url: string;
  html: string;
}

export interface DemoDataset {
  key: string;
  tagline: string;
  company: Omit<CompanyInput, "mode" | "registrySource">;
  pages: Record<string, string>;
  search: DemoSearchItem[];
  competitors: DemoCompetitor[];
  summary: string;
}

const page = (title: string, description: string, body: string, extraHead = "") => `<!doctype html>
<html lang="da"><head><title>${title}</title><meta name="description" content="${description}">${extraHead}</head>
<body>${body}</body></html>`;

/* -------------------------------------------------------------------------- */

const nordlysNav = `<nav><a href="/">Forside</a> <a href="/ydelser">Ydelser</a> <a href="/om-os">Om os</a> <a href="/kontakt">Kontakt</a> <a href="/job">Job</a></nav>`;
const nordlysFooter = `<footer>Nordlys VVS &amp; Energi ApS · CVR-nr. 00000001 · Industrivej 12, 8260 Viby J · Tlf. <a href="tel:+4586120000">86 12 00 00</a> · <a href="https://www.facebook.com/nordlysvvs.example">Facebook</a></footer>`;
const ga = `<script async src="https://www.googletagmanager.com/gtag/js?id=G-DEMO"></script>`;

const NORDLYS: DemoDataset = {
  key: "nordlys-vvs",
  tagline: "VVS-installatør i Aarhus · 14 ansatte",
  company: {
    cvr: "00000001",
    name: "Nordlys VVS & Energi ApS",
    address: { street: "Industrivej 12", postalCode: "8260", city: "Viby J", municipality: "Aarhus", country: "DK" },
    industry: { code: "432200", text: "VVS- og blikkenslagerforretninger" },
    companyForm: { code: "80", text: "Anpartsselskab" },
    status: "Normal",
    foundedAt: "2011-03-01",
    employees: { count: 14, interval: "ANTAL_10_19", year: 2025 },
    contact: { phone: "86120000", email: "info@nordlys-vvs.example", website: "https://nordlys-vvs.example/" },
    adProtected: false,
  },
  pages: {
    "https://nordlys-vvs.example/": page(
      "Nordlys VVS & Energi — VVS-installatør i Aarhus",
      "Nordlys VVS & Energi udfører VVS-arbejde, varmepumper og badeværelsesrenovering for private og erhverv i Aarhus-området.",
      `${nordlysNav}<h1>Din lokale VVS-installatør i Aarhus</h1><p>Vi løser alt fra dryppende vandhaner til komplette badeværelser og varmepumper. Ring til os på 86 12 00 00 — vi har åbent hverdage 7-15.30.</p>
       <h2>Varmepumper og energioptimering</h2><p>Vi installerer luft-til-vand-varmepumper og hjælper med energitilskud.</p>
       <h2>Badeværelsesrenovering</h2><p>Fra idé til færdigt badeværelse.</p>
       <h2>Akut VVS-hjælp</h2><p>Ved akutte skader: ring på vores hovednummer i åbningstiden.</p>${nordlysFooter}`,
      ga,
    ),
    "https://nordlys-vvs.example/ydelser": page(
      "Ydelser — Nordlys VVS & Energi",
      "Varmepumper, badeværelser, service og vedligehold.",
      `${nordlysNav}<h1>Vores ydelser</h1><h2>Varmepumper</h2><p>Rådgivning, installation og service af luft-til-vand-varmepumper.</p><h2>Badeværelser</h2><p>Totalrenovering inkl. fliser og sanitet.</p><h2>Serviceaftaler</h2><p>Årligt eftersyn af varmeanlæg for private og boligforeninger.</p><h2>Erhverv</h2><p>VVS-entrepriser for erhvervsbyggeri.</p><p>Kontakt os telefonisk for at aftale et besøg.</p>${nordlysFooter}`,
      ga,
    ),
    "https://nordlys-vvs.example/om-os": page(
      "Om os — Nordlys VVS & Energi",
      "Familieejet VVS-virksomhed siden 2011.",
      `${nordlysNav}<h1>Om Nordlys VVS</h1><p>Vi er 14 medarbejdere, heraf 10 montører, og har siden 2011 betjent private kunder, boligforeninger og erhverv i Østjylland. Tilbud udarbejdes efter besigtigelse.</p>${nordlysFooter}`,
      ga,
    ),
    "https://nordlys-vvs.example/kontakt": page(
      "Kontakt — Nordlys VVS & Energi",
      "Kontakt Nordlys VVS & Energi.",
      `${nordlysNav}<h1>Kontakt os</h1><p>Telefon: <a href="tel:+4586120000">86 12 00 00</a> (hverdage 7-15.30)</p><p>E-mail: info@nordlys-vvs.example</p>
       <form action="/kontakt" method="post"><label>Navn <input name="navn"></label><label>E-mail <input type="email" name="email"></label><label>Besked <textarea name="besked"></textarea></label><button>Send</button></form>${nordlysFooter}`,
      ga,
    ),
    "https://nordlys-vvs.example/job": page(
      "Job — Nordlys VVS & Energi",
      "Ledige stillinger hos Nordlys VVS.",
      `${nordlysNav}<h1>Ledige stillinger</h1><h2>Administrativ medarbejder til ordrestyring og fakturering</h2><p>Du skal tage telefonen, planlægge montørernes kalender og fakturere afsluttede opgaver.</p>${nordlysFooter}`,
      ga,
    ),
  },
  search: [
    {
      kind: "jobs",
      title: "Administrativ medarbejder til ordrestyring — Nordlys VVS & Energi (Jobportal Demo)",
      url: "https://jobportal.example/job/nordlys-vvs-administrativ",
      text: "Nordlys VVS & Energi søger administrativ medarbejder til ordrestyring, telefonpasning og fakturering. Du bliver bindeled mellem kunder og vores montører.",
    },
    {
      kind: "jobs",
      title: "Kundekoordinator, 30 timer — Nordlys VVS & Energi (Jobportal Demo)",
      url: "https://jobportal.example/job/nordlys-vvs-kundekoordinator",
      text: "Vi søger en kundekoordinator til at besvare henvendelser fra kunder og booke servicebesøg. Kundeservice-erfaring er en fordel.",
    },
    {
      kind: "reviews",
      title: "Anmeldelse: \"Godt arbejde, men svært at komme igennem\" (Anmeldelsesportal Demo)",
      url: "https://anmeldelser.example/nordlys-vvs/1",
      text: "Montøren var dygtig og ryddede pænt op. Men det var svært at komme igennem på telefonen — jeg ringede tre gange, før jeg fik fat i nogen. 4/5 stjerner.",
    },
    {
      kind: "reviews",
      title: "Anmeldelse: \"Hurtig hjælp til varmepumpe\" (Anmeldelsesportal Demo)",
      url: "https://anmeldelser.example/nordlys-vvs/2",
      text: "Fik installeret varmepumpe inden for to uger. Tilbuddet var klart og prisen fair. 5/5 stjerner.",
    },
    {
      kind: "news",
      title: "Lokal VVS-virksomhed udvider med varmepumpeafdeling (Lokalavis Demo)",
      url: "https://lokalavis.example/nyheder/nordlys-vvs-udvider",
      text: "Nordlys VVS & Energi i Viby J har ansat to nye montører for at følge med efterspørgslen på varmepumper, fortæller indehaveren.",
    },
  ],
  competitors: [
    {
      name: "Aarhus Rør & Varme ApS (fiktiv)",
      url: "https://aarhus-roer.example/",
      html: page(
        "Aarhus Rør & Varme",
        "VVS i Aarhus med online booking.",
        `<h1>VVS i Aarhus</h1><p><a href="/booking">Book tid online</a> til service eller besigtigelse.</p><div class="chat-widget" data-chat-widget="demo"></div><p>Tilmeld dig vores nyhedsbrev med energiråd.</p><a href="https://www.instagram.com/aarhusroer.example">Instagram</a>`,
        ga,
      ),
    },
    {
      name: "Østjysk VVS-Service (fiktiv)",
      url: "https://ostjysk-vvs.example/",
      html: page(
        "Østjysk VVS-Service",
        "VVS-service i Østjylland.",
        `<h1>VVS-service</h1><p>Ring 87 00 00 00.</p><form><input type="email" name="email"><textarea name="besked"></textarea></form><a href="https://www.facebook.com/ostjyskvvs.example">Facebook</a>`,
      ),
    },
  ],
  summary:
    "Nordlys VVS & Energi ApS er en fiktiv VVS-installatør i Aarhus med 14 ansatte, der arbejder med varmepumper, badeværelser og serviceaftaler. Kundekontakten foregår primært via telefon i åbningstiden, og virksomheden rekrutterer aktuelt til ordrestyring og kundekoordinering. En anmeldelse nævner, at det kan være svært at komme igennem telefonisk. De største potentialer ligger i kundekontakt, booking og administrativ automatisering. (DEMO)",
};

/* -------------------------------------------------------------------------- */

const havblikNav = `<nav><a href="/">Forside</a> <a href="/behandlinger">Behandlinger</a> <a href="/priser">Priser</a> <a href="/kontakt">Kontakt</a></nav>`;
const havblikFooter = `<footer>Klinik Havblik · Havnegade 4, 5000 Odense C · Tlf. 66 10 20 30 · <a href="https://www.instagram.com/klinikhavblik.example">Instagram</a></footer>`;

const HAVBLIK: DemoDataset = {
  key: "klinik-havblik",
  tagline: "Tandklinik i Odense · 9 ansatte",
  company: {
    cvr: "00000002",
    name: "Klinik Havblik ApS",
    address: { street: "Havnegade 4", postalCode: "5000", city: "Odense C", municipality: "Odense", country: "DK" },
    industry: { code: "862300", text: "Tandlæger" },
    companyForm: { code: "80", text: "Anpartsselskab" },
    status: "Normal",
    foundedAt: "2016-08-15",
    employees: { count: 9, interval: "ANTAL_5_9", year: 2025 },
    contact: { phone: "66102030", email: "klinik@havblik.example", website: "https://havblik.example/" },
    adProtected: true,
  },
  pages: {
    "https://havblik.example/": page(
      "Klinik Havblik — Tandlæge i Odense C",
      "Klinik Havblik er en moderne tandklinik i Odense C med fokus på forebyggelse, æstetisk tandpleje og angstpatienter.",
      `${havblikNav}<h1>Tandlæge i hjertet af Odense</h1><p>Bestil tid på telefon 66 10 20 30 mandag-fredag 8-16.</p><h2>Forebyggende tandpleje</h2><h2>Tandblegning og æstetik</h2><h2>Tryghed for angstpatienter</h2>${havblikFooter}`,
    ),
    "https://havblik.example/behandlinger": page(
      "Behandlinger — Klinik Havblik",
      "Undersøgelse, tandrensning, fyldninger, kroner og tandblegning.",
      `${havblikNav}<h1>Behandlinger</h1><h2>Undersøgelse og tandrensning</h2><h2>Fyldninger og kroner</h2><h2>Tandblegning</h2><h2>Implantater</h2><p>Ring for at bestille tid.</p>${havblikFooter}`,
    ),
    "https://havblik.example/priser": page(
      "Priser — Klinik Havblik",
      "Prisliste for behandlinger.",
      `${havblikNav}<h1>Priser</h1><p>Se vores prisliste. Spørgsmål om priser besvares telefonisk.</p>${havblikFooter}`,
    ),
    "https://havblik.example/kontakt": page(
      "Kontakt — Klinik Havblik",
      "Kontakt klinikken.",
      `${havblikNav}<h1>Kontakt</h1><p>Telefon 66 10 20 30. Akut tandpine: ring kl. 8-9.</p><p>E-mail: klinik@havblik.example (besvares inden for 2 hverdage)</p>${havblikFooter}`,
    ),
  },
  search: [
    {
      kind: "reviews",
      title: "Anmeldelse: \"Søde folk, men lang ventetid i telefonen\" (Anmeldelsesportal Demo)",
      url: "https://anmeldelser.example/klinik-havblik/1",
      text: "Meget tryg behandling. Til gengæld var der lang ventetid i telefonen, da jeg skulle flytte min tid. 4/5.",
    },
    {
      kind: "jobs",
      title: "Klinikassistent/receptionist søges — Klinik Havblik (Jobportal Demo)",
      url: "https://jobportal.example/job/klinik-havblik-receptionist",
      text: "Vi søger en receptionist til telefonbetjening, tidsbestilling og patientkontakt.",
    },
  ],
  competitors: [
    {
      name: "Odense Tandcenter (fiktiv)",
      url: "https://odense-tand.example/",
      html: page(
        "Odense Tandcenter",
        "Book tid online hos Odense Tandcenter.",
        `<h1>Tandlæge i Odense</h1><a href="/online-booking">Book tid online</a><p>Tilmeld nyhedsbrev.</p><a href="https://www.facebook.com/odensetand.example">Facebook</a>`,
        ga,
      ),
    },
  ],
  summary:
    "Klinik Havblik ApS er en fiktiv tandklinik i Odense C med 9 ansatte. Tidsbestilling sker via telefon i åbningstiden, og klinikken rekrutterer en receptionist til telefonbetjening. En anmeldelse nævner lang ventetid i telefonen, og en observeret konkurrent tilbyder online booking. Potentialet ligger primært i booking og automatiseret patientkontakt. Virksomheden er reklamebeskyttet i CVR. (DEMO)",
};

/* -------------------------------------------------------------------------- */

const fjordNav = `<nav><a href="/">Forside</a> <a href="/produkter">Produkter</a> <a href="/om-os">Om os</a> <a href="/kontakt">Kontakt</a> <a href="/kurv">Kurv</a></nav>`;
const fjordFooter = `<footer>Studio Fjord Interiør ApS · CVR 00000003 · Vesterbrogade 101, 1620 København V · <a href="https://www.instagram.com/studiofjord.example">Instagram</a> <a href="https://www.linkedin.com/company/studiofjord-example">LinkedIn</a> · Tilmeld nyhedsbrev <form><input type="email" name="newsletter"></form></footer>`;
const shop = `<script src="https://cdn.shopify.com/demo.js"></script>${ga}`;

const FJORD: DemoDataset = {
  key: "studio-fjord",
  tagline: "Webshop med boligindretning · 23 ansatte",
  company: {
    cvr: "00000003",
    name: "Studio Fjord Interiør ApS",
    address: { street: "Vesterbrogade 101", postalCode: "1620", city: "København V", municipality: "København", country: "DK" },
    industry: { code: "479110", text: "Detailhandel fra postordreforretninger og via internettet" },
    companyForm: { code: "80", text: "Anpartsselskab" },
    status: "Normal",
    foundedAt: "2018-02-01",
    employees: { count: 23, interval: "ANTAL_20_49", year: 2025 },
    contact: { phone: "33000000", email: "hej@studiofjord.example", website: "https://studiofjord.example/" },
    adProtected: false,
  },
  pages: {
    "https://studiofjord.example/": page(
      "Studio Fjord — Nordisk boligindretning online",
      "Studio Fjord sælger nordisk designet boligtilbehør, tekstiler og belysning online med levering i hele Norden.",
      `${fjordNav}<h1>Nordisk indretning — leveret til døren</h1><h2>Nyheder i tekstiler</h2><h2>Belysning</h2><h2>Gratis fragt over 799 kr.</h2><button>Læg i kurv</button><p>Kundeservice: hej@studiofjord.example — svar inden for 48 timer.</p>${fjordFooter}`,
      shop,
    ),
    "https://studiofjord.example/produkter": page(
      "Produkter — Studio Fjord",
      "Tekstiler, belysning, keramik og møbler.",
      `${fjordNav}<h1>Produkter</h1><h2>Tekstiler</h2><h2>Belysning</h2><h2>Keramik</h2><h2>Små møbler</h2><button>Tilføj til kurv</button>${fjordFooter}`,
      shop,
    ),
    "https://studiofjord.example/kontakt": page(
      "Kontakt — Studio Fjord",
      "Kontakt kundeservice.",
      `${fjordNav}<h1>Kundeservice</h1><p>Skriv til os — vi svarer inden for 48 timer på hverdage.</p><form><input type="email" name="email"><textarea name="besked"></textarea></form>${fjordFooter}`,
      shop,
    ),
  },
  search: [
    {
      kind: "jobs",
      title: "Kundeservicemedarbejder til webshop — Studio Fjord (Jobportal Demo)",
      url: "https://jobportal.example/job/studio-fjord-kundeservice",
      text: "Vi søger kundeservicemedarbejder til at besvare mails om ordrer, levering og returneringer i højsæsonen.",
    },
    {
      kind: "jobs",
      title: "Lager- og administrationsmedarbejder — Studio Fjord (Jobportal Demo)",
      url: "https://jobportal.example/job/studio-fjord-admin",
      text: "Administrativ medarbejder til ordrebehandling, returneringer og bogholderi. Du skal overføre ordrer mellem webshop og økonomisystem.",
    },
    {
      kind: "reviews",
      title: "Anmeldelse: \"Flotte produkter, men lang svartid\" (Anmeldelsesportal Demo)",
      url: "https://anmeldelser.example/studio-fjord/1",
      text: "Produkterne er flotte, men det tog fire dage at få svar på min mail om levering. 3/5.",
    },
  ],
  competitors: [
    {
      name: "Nordhjem Living (fiktiv)",
      url: "https://nordhjem.example/",
      html: page(
        "Nordhjem Living",
        "Nordisk design online.",
        `<h1>Nordisk design</h1><button>Læg i kurv</button><script src="https://widget.intercom.io/demo.js"></script><a href="https://www.instagram.com/nordhjem.example">Instagram</a><p>Nyhedsbrev</p>`,
        `<script src="https://cdn.shopify.com/demo.js"></script>`,
      ),
    },
  ],
  summary:
    "Studio Fjord Interiør ApS er en fiktiv webshop i København med 23 ansatte, der sælger nordisk boligindretning. Kundeservice foregår via e-mail med op til 48 timers svartid, og virksomheden rekrutterer til kundeservice og ordreadministration. En anmeldelse nævner lang svartid, og en observeret konkurrent har chatfunktion. Potentialet ligger i AI-kundeservice, chatbot og integration mellem webshop og økonomisystem. (DEMO)",
};

/* -------------------------------------------------------------------------- */
/* V2-scenarier: flere brands under ét CVR og flere juridiske enheder bag ét brand */
/* -------------------------------------------------------------------------- */

const cafeFooter = `<footer>Fjordhuset Café drives af Fjordhuset Gruppen ApS · CVR 00000004 · Havnen 3, 8000 Aarhus C · Tlf. 70 70 10 10 · <a href="https://www.instagram.com/fjordhusetcafe.example">Instagram</a></footer>`;
const FJORDHUSET_CAFE: DemoDataset = {
  key: "fjordhuset-cafe",
  tagline: "Café på havnen i Aarhus (brand under Fjordhuset Gruppen)",
  company: {
    cvr: "00000004",
    name: "Fjordhuset Gruppen ApS",
    address: { street: "Havnen 3", postalCode: "8000", city: "Aarhus C", municipality: "Aarhus", country: "DK" },
    industry: { code: "561010", text: "Restauranter" },
    companyForm: { code: "80", text: "Anpartsselskab" },
    status: "Normal",
    foundedAt: "2014-05-01",
    employees: { count: 31, interval: "ANTAL_20_49", year: 2025 },
    contact: { phone: "70701010", email: "kontakt@fjordhuset.example", website: null },
    adProtected: false,
  },
  pages: {
    "https://fjordhuset-cafe.example/": page(
      "Fjordhuset Café — brunch og frokost på havnen",
      "Fjordhuset Café serverer brunch, frokost og kage med udsigt over Aarhus havn.",
      `<nav><a href="/menu">Menu</a> <a href="/bord">Bestil bord</a> <a href="/kontakt">Kontakt</a></nav><h1>Brunch med havudsigt</h1><h2>Weekendbrunch</h2><h2>Frokost</h2><p>Bordbestilling: ring på 70 70 10 10 eller send en mail.</p>${cafeFooter}`,
      `<meta property="og:site_name" content="Fjordhuset Café">`,
    ),
    "https://fjordhuset-cafe.example/bord": page(
      "Bestil bord — Fjordhuset Café",
      "Bordbestilling.",
      `<h1>Bestil bord</h1><p>Ring til os eller skriv til bord@fjordhuset-cafe.example. Vi bekræfter inden for et døgn.</p><form><input type="email" name="email"><textarea name="besked"></textarea></form>${cafeFooter}`,
    ),
  },
  search: [
    { kind: "reviews", title: "Anmeldelse: \"Hyggelig brunch, men svært at bestille bord\" (Anmeldelsesportal Demo)", url: "https://anmeldelser.example/fjordhuset-cafe/1", text: "Lækker brunch. Vi ventede to dage på svar om bordbestilling og endte med at ringe. 4/5." },
    { kind: "jobs", title: "Caféassistent søges — Fjordhuset Café (Jobportal Demo)", url: "https://jobportal.example/job/fjordhuset-cafe", text: "Fjordhuset Café søger caféassistent til servering og håndtering af bordreservationer og telefon." },
  ],
  competitors: [
    {
      name: "Havnecaféen Aarhus (fiktiv)",
      url: "https://havnecafeen.example/",
      html: page("Havnecaféen", "Book bord online.", `<h1>Havnecaféen</h1><a href="/online-booking">Book bord online</a><p>Tilmeld nyhedsbrev.</p>`),
    },
  ],
  summary:
    "Fjordhuset Café er et fiktivt cafébrand på Aarhus havn, drevet af Fjordhuset Gruppen ApS. Bordbestilling sker via telefon og e-mail, og en anmeldelse nævner ventetid på svar. Caféen rekrutterer til håndtering af reservationer. Potentialet ligger i online booking og automatiseret gæstekommunikation. (DEMO)",
};

const eventsFooter = `<footer>Fjordhuset Events er en del af Fjordhuset Gruppen ApS · CVR 00000004 · Søvej 8, 8600 Silkeborg</footer>`;
const FJORDHUSET_EVENTS: DemoDataset = {
  key: "fjordhuset-events",
  tagline: "Selskabslokaler og events i Silkeborg (brand under Fjordhuset Gruppen)",
  company: FJORDHUSET_CAFE.company,
  pages: {
    "https://fjordhuset-events.example/": page(
      "Fjordhuset Events — selskaber, konferencer og bryllupper",
      "Selskabslokaler ved Silkeborg-søerne til fester, firmaevents og konferencer.",
      `<nav><a href="/lokaler">Lokaler</a> <a href="/priser">Priser</a> <a href="/kontakt">Kontakt</a></nav><h1>Selskaber ved søen</h1><h2>Bryllupper</h2><h2>Firmaevents og konferencer</h2><p>Send en forespørgsel, så vender vi tilbage med et tilbud.</p>${eventsFooter}`,
      `<meta property="og:site_name" content="Fjordhuset Events">${ga}`,
    ),
    "https://fjordhuset-events.example/priser": page(
      "Priser — Fjordhuset Events",
      "Priser på lokaler og menuer.",
      `<h1>Priser</h1><p>Priser afhænger af antal gæster og menu. Kontakt os for et individuelt tilbud.</p><form><input type="email" name="email"><textarea name="forespoergsel"></textarea></form>${eventsFooter}`,
    ),
  },
  search: [
    { kind: "jobs", title: "Eventkoordinator med salgsansvar — Fjordhuset Events (Jobportal Demo)", url: "https://jobportal.example/job/fjordhuset-events", text: "Vi søger en eventkoordinator, der kan håndtere forespørgsler, udarbejde tilbud og følge op på salg." },
  ],
  competitors: [],
  summary:
    "Fjordhuset Events er et fiktivt brand under Fjordhuset Gruppen ApS med selskabslokaler i Silkeborg. Forespørgsler håndteres via formular og manuelle tilbud, og der rekrutteres en eventkoordinator med salgsansvar. Potentialet ligger i leadhåndtering, tilbudsopfølgning og salgsautomatisering. (DEMO)",
};

const bryggerietFooter = `<footer>Bryggeriet Nordlys Drift ApS · CVR 00000006 · Ejet af Bryggeriet Nordlys Holding ApS (CVR 00000005) · Bryggervej 2, 9000 Aalborg · <a href="https://www.facebook.com/bryggerietnordlys.example">Facebook</a></footer>`;
const BRYGGERIET: DemoDataset = {
  key: "bryggeriet-nordlys",
  tagline: "Mikrobryggeri med webshop og ølsmagninger (to juridiske enheder)",
  company: {
    cvr: "00000006",
    name: "Bryggeriet Nordlys Drift ApS",
    address: { street: "Bryggervej 2", postalCode: "9000", city: "Aalborg", municipality: "Aalborg", country: "DK" },
    industry: { code: "110500", text: "Fremstilling af øl" },
    companyForm: { code: "80", text: "Anpartsselskab" },
    status: "Normal",
    foundedAt: "2019-03-01",
    employees: { count: 12, interval: "ANTAL_10_19", year: 2025 },
    contact: { phone: null, email: null, website: null },
    adProtected: false,
  },
  pages: {
    "https://bryggeriet-nordlys.example/": page(
      "Bryggeriet Nordlys — håndbrygget øl fra Aalborg",
      "Mikrobryggeri med webshop, ølsmagninger og firmaarrangementer.",
      `<nav><a href="/shop">Shop</a> <a href="/smagninger">Ølsmagninger</a> <a href="/kontakt">Kontakt</a></nav><h1>Håndbrygget i Aalborg</h1><h2>Webshop</h2><h2>Ølsmagninger for firmaer</h2><button>Læg i kurv</button>${bryggerietFooter}`,
      `<meta property="og:site_name" content="Bryggeriet Nordlys"><script src="https://cdn.shopify.com/demo.js"></script>${ga}`,
    ),
    "https://bryggeriet-nordlys.example/smagninger": page(
      "Ølsmagninger — Bryggeriet Nordlys",
      "Book en ølsmagning.",
      `<h1>Ølsmagninger</h1><p>Smagninger arrangeres efter aftale. Skriv til os med dato og antal deltagere.</p><form><input type="email" name="email"><textarea name="besked"></textarea></form>${bryggerietFooter}`,
    ),
  },
  search: [
    { kind: "reviews", title: "Anmeldelse: \"God øl, men min ordre var længe undervejs\" (Anmeldelsesportal Demo)", url: "https://anmeldelser.example/bryggeriet-nordlys/1", text: "Fantastisk øl. Til gengæld tog det lang tid at få svar på, hvor min pakke var. 3/5." },
    { kind: "jobs", title: "Ordre- og lagermedarbejder — Bryggeriet Nordlys (Jobportal Demo)", url: "https://jobportal.example/job/bryggeriet-nordlys", text: "Administrativ medarbejder til ordrebehandling, lager og overførsel af ordrer til økonomisystemet." },
  ],
  competitors: [],
  summary:
    "Bryggeriet Nordlys er et fiktivt mikrobryggeri i Aalborg med webshop og ølsmagninger. Hjemmesiden nævner to juridiske enheder (drift og holding), som ikke er bekræftet. Ordrebehandling og kundeservice synes at være manuel, og der rekrutteres til ordreadministration. Potentialet ligger i systemintegration, kundeservice og booking af smagninger. (DEMO)",
};

export const DEMO_DATASETS: readonly DemoDataset[] = [NORDLYS, HAVBLIK, FJORD, FJORDHUSET_CAFE, FJORDHUSET_EVENTS, BRYGGERIET];

/** Fiktivt CVR-register for Demo Mode (inkl. binavne og P-numre). */
export interface DemoLegalEntity {
  company: DemoDataset["company"];
  secondaryNames: string[];
  establishments: Array<{ pNumber: string; name: string; street: string; postalCode: string; city: string; industry: string }>;
  /** Kun i Demo Mode: kendte hjemmesider for brands under CVR'et (hjælp til brugerfladen). */
  brandWebsites: Record<string, string>;
}

export const DEMO_REGISTRY: readonly DemoLegalEntity[] = [
  { company: NORDLYS.company, secondaryNames: [], establishments: [{ pNumber: "0000000101", name: "Nordlys VVS & Energi ApS", street: "Industrivej 12", postalCode: "8260", city: "Viby J", industry: "VVS- og blikkenslagerforretninger" }], brandWebsites: { "Nordlys VVS & Energi ApS": "https://nordlys-vvs.example/" } },
  { company: HAVBLIK.company, secondaryNames: [], establishments: [], brandWebsites: { "Klinik Havblik ApS": "https://havblik.example/" } },
  { company: FJORD.company, secondaryNames: ["Studio Fjord"], establishments: [], brandWebsites: { "Studio Fjord": "https://studiofjord.example/", "Studio Fjord Interiør ApS": "https://studiofjord.example/" } },
  {
    company: FJORDHUSET_CAFE.company,
    secondaryNames: ["Fjordhuset Café", "Fjordhuset Events"],
    establishments: [
      { pNumber: "0000000401", name: "Fjordhuset Café", street: "Havnen 3", postalCode: "8000", city: "Aarhus C", industry: "Caféer" },
      { pNumber: "0000000402", name: "Fjordhuset Events", street: "Søvej 8", postalCode: "8600", city: "Silkeborg", industry: "Selskabslokaler" },
    ],
    brandWebsites: { "Fjordhuset Café": "https://fjordhuset-cafe.example/", "Fjordhuset Events": "https://fjordhuset-events.example/" },
  },
  {
    company: { ...BRYGGERIET.company, cvr: "00000005", name: "Bryggeriet Nordlys Holding ApS", industry: { code: "642020", text: "Ikke-finansielle holdingselskaber" }, employees: { count: 0, interval: "ANTAL_0_0", year: 2025 } },
    secondaryNames: [],
    establishments: [],
    brandWebsites: {},
  },
  { company: BRYGGERIET.company, secondaryNames: ["Bryggeriet Nordlys"], establishments: [{ pNumber: "0000000601", name: "Bryggeriet Nordlys", street: "Bryggervej 2", postalCode: "9000", city: "Aalborg", industry: "Fremstilling af øl" }], brandWebsites: { "Bryggeriet Nordlys": "https://bryggeriet-nordlys.example/" } },
];

export function findDemoLegalEntity(cvr: string): DemoLegalEntity | undefined {
  return DEMO_REGISTRY.find((e) => e.company.cvr === cvr);
}

/** Finder det fiktive datasæt for et domæne (fx "nordlys-vvs.example"). */
export function findDemoSiteByDomain(domain: string): DemoDataset | undefined {
  const d = domain.toLowerCase().replace(/^www\./, "");
  return DEMO_DATASETS.find((ds) => Object.keys(ds.pages).some((u) => new URL(u).hostname === d));
}

export function demoSiteUrl(ds: DemoDataset): string {
  return Object.keys(ds.pages)[0];
}

/** Eksempler, som brugerfladen viser i Demo Mode. */
export const DEMO_EXAMPLES = [
  { type: "cvr" as const, value: "00000001", label: "Nordlys VVS (CVR)", hint: "Ét brand med hjemmeside" },
  { type: "cvr" as const, value: "00000004", label: "Fjordhuset Gruppen (CVR)", hint: "To brands under samme CVR" },
  { type: "url" as const, value: "https://bryggeriet-nordlys.example", label: "Bryggeriet Nordlys (URL)", hint: "Hjemmesiden nævner to CVR-numre" },
  { type: "url" as const, value: "https://havblik.example", label: "Klinik Havblik (URL)", hint: "Intet CVR på hjemmesiden" },
  { type: "url" as const, value: "https://studiofjord.example", label: "Studio Fjord (URL)", hint: "Webshop med CVR i footer" },
];

export function getDemoDataset(key: string): DemoDataset | undefined {
  return DEMO_DATASETS.find((d) => d.key === key);
}

export function getDemoDatasetByCvr(cvr: string): DemoDataset | undefined {
  return DEMO_DATASETS.find((d) => d.company.cvr === cvr);
}
