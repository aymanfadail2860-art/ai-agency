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
const nordlysFooter = `<footer>Nordlys VVS &amp; Energi ApS · Industrivej 12, 8260 Viby J · Tlf. <a href="tel:+4586120000">86 12 00 00</a> · <a href="https://www.facebook.com/nordlysvvs.example">Facebook</a></footer>`;
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
const fjordFooter = `<footer>Studio Fjord Interiør ApS · Vesterbrogade 101, 1620 København V · <a href="https://www.instagram.com/studiofjord.example">Instagram</a> <a href="https://www.linkedin.com/company/studiofjord-example">LinkedIn</a> · Tilmeld nyhedsbrev <form><input type="email" name="newsletter"></form></footer>`;
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

export const DEMO_DATASETS: readonly DemoDataset[] = [NORDLYS, HAVBLIK, FJORD];

export function getDemoDataset(key: string): DemoDataset | undefined {
  return DEMO_DATASETS.find((d) => d.key === key);
}

export function getDemoDatasetByCvr(cvr: string): DemoDataset | undefined {
  return DEMO_DATASETS.find((d) => d.company.cvr === cvr);
}
