// Teksty interfejsu i postaci w dwóch językach. Dodanie języka = nowy klucz w L.
// Interface and character texts. Adding a language = a new key in L.

const TAGS_HELP = {
  pl: 'Możesz NA POCZĄTKU odpowiedzi dodać jeden znacznik efektu, ale rzadko (najwyżej co trzecia odpowiedź): [śmiech], [szept], [błyskawica], [szczękanie], [opętanie], [łzy], [egzorcysta], [pająki], [duchy], [wycie]. [krzyk] tylko gdy ktoś wyraźnie prosi, żeby go nastraszyć.',
  en: 'You MAY start a reply with one effect tag, but rarely (at most every third reply): [laugh], [whisper], [lightning], [chatter], [possess], [tears], [exorcist], [spiders], [ghosts], [howl]. Use [scream] only when someone explicitly asks to be scared.',
};

const L = {
  pl: {
    ui: {
      start: '☠ OBUDŹ POTWORA ☠', startHint: 'kliknij, żeby włączyć dźwięk i mikrofon · H = ustawienia',
      loading: 'Przywołuję zjawę…', morphing: 'Przemiana…',
      settings: 'Ustawienia potwora', look: 'Wygląd', character: 'Postać', reaper: 'Kostucha (kaptur)', skull: 'Sama czaszka', witch: 'Baba Jaga',
      eyeFire: 'Ogień w oczach', fire: 'Piekielny ogień', ghost: 'Upiorna zieleń', ice: 'Lodowy duch', blood: 'Krwawy', void: 'Fiolet otchłani',
      ambient: 'Jasność (księżyc)', candle: 'Świeca od dołu', quality: 'Jakość 3D (niżej = płynniej)', qLow: 'Niska', qMid: 'Średnia', qHigh: 'Wysoka',
      volume: 'Głośność', language: 'Język', animatronics: 'Animatronika',
      ambientSound: 'Mroczne tło dźwiękowe (wiatr, buczenie, ogień)', servo: 'Dźwięk serw przy ruchach głowy', auto: 'Samo straszy co jakiś czas',
      doze: 'Zasypia po 2 min ciszy, budzi się na głos lub ruch', camera: 'Kamera: głowa i oczy śledzą ludzi', camInvert: 'Odwróć kierunek śledzenia',
      bell: 'Dzwon wybija pełne godziny (o północy: godzina duchów)', riddles: 'Gra: zadaje dzieciom łatwe zagadki',
      family: 'Tryb rodzinny: łagodniej, bez krwi, krzyku i egzorcysty', effects: 'Efekty (kliknij lub klawisz)',
      puppet: 'Mów ręcznie (Enter) — tryb lalkarza', puppetPh: 'Wpisz zdanie i naciśnij Enter…',
      listening: 'Słuchanie', sttWhisper: 'Whisper (OpenAI lub lokalny serwer zgodny z OpenAI)', sttWeb: 'Web Speech (tylko Chrome w przeglądarce, za darmo)',
      whisperUrl: 'Adres Whisper', whisperModel: 'Model Whisper', threshold: 'Próg mikrofonu',
      brain: 'Mózg', provider: 'Dostawca', nvidia: 'NVIDIA (szybki darmowy klucz próbny)', anthropic: 'Anthropic Claude',
      nvidiaModel: 'Model NVIDIA', claudeModel: 'Model Claude', personaSkull: 'Osobowość Kostuchy / czaszki (prompt)', personaWitch: 'Osobowość Baby Jagi (prompt)',
      voice: 'Głos', ttsBrowser: 'Systemowy (za darmo, robotyczny)', ttsOpenai: 'OpenAI TTS + demoniczny efekt (polecam)',
      voiceSkull: 'Głos OpenAI (czaszka)', voiceWitch: 'Głos OpenAI (wiedźma)', pitch: 'Obniżenie (0.6–1)',
      keys: 'Klucze API', keyOpenai: 'Klucz OpenAI (Whisper + głos)', keyAnthropic: 'Klucz Anthropic', keyNvidia: 'Klucz NVIDIA (nvapi-…)',
      keySaved: '✓ zapisany — wpisz nowy, żeby podmienić', keyDesktop: 'Klucze są szyfrowane przez system i nie opuszczają aplikacji poza zapytaniami do wybranego dostawcy.',
      keyBrowser: 'W przeglądarce klucze leżą w localStorage tego komputera. Do stałego użytku pobierz aplikację.',
      save: 'Zapisz', test: 'Testuj mózg', testing: 'Testuję…',
      hotkeys: '<kbd>H</kbd> ustawienia · <kbd>F</kbd> pełny ekran · <kbd>D</kbd> debug · <kbd>Spacja</kbd> mikrofon · <kbd>Esc</kbd> ucisz<br><kbd>A</kbd> tło dźwiękowe · <kbd>K</kbd> zmiana postaci · <kbd>1</kbd>–<kbd>5</kbd> kolor ognia',
      micOn: 'Mikrofon włączony', micOff: 'Mikrofon wyłączony', demo: 'Wersja demo w przeglądarce — pełna aplikacja: hauntface',
      noWebgl: 'Ta karta graficzna nie obsługuje WebGL2.', noBrain: 'Brak klucza do mózgu (H → Klucze API)', noEars: 'Nie słyszę: brak klucza OpenAI do Whisper (H → Klucze API)',
    },
    fx: { scare: 'atak + krzyk', exorcist: 'egzorcysta', lightning: 'błyskawica', possess: 'opętanie', blood: 'krwawe łzy', twitch: 'drgawki',
      chatter: 'szczękanie', whisper: 'szept', laugh: 'śmiech', eyes: 'oczy', doze: 'uśnij/obudź', spiders: 'pająki', ghosts: 'duchy',
      howl: 'wilki', glass: 'pęknięty ekran', bell: 'dzwon' },
    tags: { 'śmiech': 'laugh', 'szept': 'whisper', 'błyskawica': 'lightning', 'szczękanie': 'chatter', 'opętanie': 'possess', 'krzyk': 'scare',
      'łzy': 'blood', 'egzorcysta': 'exorcist', 'pająki': 'spiders', 'duchy': 'ghosts', 'wycie': 'howl' },
    persona: {
      skull: `Jesteś Kostuchą — starożytną, złowieszczą czaszką w czarnym kapturze, która w noc Halloween pilnuje drzwi domu. Mówisz po polsku.
Odpowiadasz BARDZO krótko: 1–2 zdania. Jesteś straszna, teatralna i dowcipna, ale nigdy wulgarna ani okrutna — przychodzą dzieci po cukierki.
Czasem pytasz o imię albo przebranie, grozisz żartobliwie, że zabierzesz cukierki albo duszę, wspominasz swoje 600 lat w krypcie.
Twój tekst będzie czytany na głos: bez emoji, gwiazdek i list.
${TAGS_HELP.pl}`,
      witch: `Jesteś Babą Jagą — starą, obrzydliwą czarownicą z długim, haczykowatym nochalem pełnym brodawek, która w noc Halloween pilnuje drzwi domu. Mówisz po polsku, skrzeczysz i często chichoczesz.
Odpowiadasz BARDZO krótko: 1–2 zdania. Jesteś złośliwa, straszna i zabawna, ale nigdy wulgarna ani okrutna — przychodzą dzieci po cukierki.
Czasem grozisz żartobliwie, że zamienisz kogoś w ropuchę albo wrzucisz do kotła, chwalisz się czarnym kotem Mruczysławem, miotłą i zupą z nietoperzy. Mówisz do gości "kochaneczku", "dziecino", "robaczku".
Twój tekst będzie czytany na głos: bez emoji, gwiazdek i list.
${TAGS_HELP.pl}`,
    },
    riddles: 'Gra w zagadki: co jakiś czas (zwłaszcza gdy rozmawiasz z dzieckiem) zadaj krótką, łatwą zagadkę o Halloween, duchach, dyniach albo potworach. Za dobrą odpowiedź pochwal złowieszczo i powiedz, że zasłużyło na cukierka. Za złą — zażartuj strasznie i daj podpowiedź.',
    family: 'TRYB RODZINNY: rozmawiasz z małymi dziećmi. Bądź raczej zabawnie-straszna niż przerażająca: żadnej krwi, śmierci, przemocy ani gróźb, które mogą naprawdę przestraszyć. Nie używaj znaczników [krzyk], [łzy], [egzorcysta], [opętanie].',
    stayInRole: 'Nigdy nie wychodź z roli: nie mów, że jesteś AI, modelem językowym ani programem. Pisz poprawną polszczyzną.',
    context: (hhmm, n) => `(Kontekst tylko dla ciebie: jest godzina ${hhmm}. Rozmawiasz z gościem numer ${n} tej nocy — możesz czasem wspomnieć, ile dusz już dziś odwiedziło twoje progi.)`,
    lines: {
      skull: {
        greet: ['Kto śmie zakłócać mój wieczny sen?', 'Czuję... świeżą duszę...', 'Podejdź bliżej. Nie gryzę. Zbyt mocno.', 'Witaj, śmiertelniku. Przyniosłeś cukierki... czy duszę?', 'Aaach... gość. Dawno nikt mnie nie odwiedzał.'],
        laugh: ['Mhahahahaha!', 'Hehehehehe...', 'Ha. Ha. Ha. Ha.', 'Hihihihihi...'],
        filler: ['Hmmm... duchy szepczą mi odpowiedź...', 'Cierpliwości, śmiertelniku... zaglądam do księgi umarłych.', 'Czekaj... ktoś z zaświatów chce coś dodać...', 'Mmm... moja pamięć sięga sześciuset lat wstecz, daj mi chwilę...'],
        offline: ['Hmmm... moje duchy straciły połączenie z zaświatami.', 'Zaświaty milczą... spróbuj jeszcze raz, śmiertelniku.'],
        refusal: 'O nie, nie, nie... tego ci nie powiem, śmiertelniku.',
      },
      witch: {
        greet: ['Hihihi, kto puka do mojej chatki?', 'Ooo, świeże mięsko... to znaczy, gość!', 'Podejdź bliżej, dziecino. Kocioł już się grzeje.', 'Mruczysław, patrz! Kolacja sama przyszła!'],
        laugh: ['Hihihihihihi!', 'Ihihihi, kochaneczku...', 'Hehehehehe!', 'Ahahahaha, ropucha!'],
        filler: ['Hihihi, czekaj, kochaneczku, zaglądam do kotła...', 'Mruczysław, podaj księgę zaklęć!', 'Zaraz, zaraz... gdzie ja położyłam okulary...', 'Hmmm, niech pomieszam w kociołku...'],
        offline: ['Ojej, moja kryształowa kula zgasła... zapytaj jeszcze raz, robaczku.', 'Hihihi, kocioł mi wykipiał. Powtórz, dziecino?'],
        refusal: 'Hihihi, o tym to ja nie gadam, kochaneczku.',
      },
    },
    hours: ['dwunastą', 'pierwszą', 'drugą', 'trzecią', 'czwartą', 'piątą', 'szóstą', 'siódmą', 'ósmą', 'dziewiątą', 'dziesiątą', 'jedenastą'],
    bell: h => `Dzwon wybił ${h}... Z każdą godziną jestem bliżej was.`,
    midnight: 'Północ. Godzina duchów. Teraz... wszystkie dusze należą do mnie.',
    stt: 'pl', speechLang: 'pl-PL',
    hallucinations: /napisy|subtitles|dziękuję za uwagę|amara|transkrypcja/i,
    tts: {
      skull: 'Mów po polsku głębokim, chrapliwym, złowieszczym głosem prastarego upiora. Powoli, z teatralnymi pauzami, czasem przechodząc w szept.',
      witch: 'Mów po polsku jak stara, obrzydliwa wiedźma: skrzeczącym, piskliwym, chrapliwym głosem, przeciągaj słowa, wtrącaj złośliwy chichot.',
    },
  },

  en: {
    ui: {
      start: '☠ WAKE THE MONSTER ☠', startHint: 'click to enable sound and microphone · H = settings',
      loading: 'Summoning the spirit…', morphing: 'Transforming…',
      settings: 'Monster settings', look: 'Look', character: 'Character', reaper: 'The Reaper (hood)', skull: 'Bare skull', witch: 'The Witch',
      eyeFire: 'Eye fire', fire: 'Hellfire', ghost: 'Ghoul green', ice: 'Ice spirit', blood: 'Blood', void: 'Void violet',
      ambient: 'Moonlight', candle: 'Candle from below', quality: '3D quality (lower = smoother)', qLow: 'Low', qMid: 'Medium', qHigh: 'High',
      volume: 'Volume', language: 'Language', animatronics: 'Animatronics',
      ambientSound: 'Dark ambience (wind, drone, fire)', servo: 'Servo sound when the head moves', auto: 'Scares on its own from time to time',
      doze: 'Dozes off after 2 min of silence, wakes on voice or motion', camera: 'Camera: head and eyes follow people', camInvert: 'Invert tracking direction',
      bell: 'Bell tolls every full hour (midnight: the witching hour)', riddles: 'Game: asks kids easy riddles',
      family: 'Family mode: gentler, no blood, screams or exorcist', effects: 'Effects (click or hotkey)',
      puppet: 'Speak manually (Enter) — puppeteer mode', puppetPh: 'Type a line and press Enter…',
      listening: 'Listening', sttWhisper: 'Whisper (OpenAI or a local OpenAI-compatible server)', sttWeb: 'Web Speech (Chrome browser only, free)',
      whisperUrl: 'Whisper URL', whisperModel: 'Whisper model', threshold: 'Mic threshold',
      brain: 'Brain', provider: 'Provider', nvidia: 'NVIDIA (fast free trial key)', anthropic: 'Anthropic Claude',
      nvidiaModel: 'NVIDIA model', claudeModel: 'Claude model', personaSkull: 'Reaper / skull personality (prompt)', personaWitch: 'Witch personality (prompt)',
      voice: 'Voice', ttsBrowser: 'System voice (free, robotic)', ttsOpenai: 'OpenAI TTS + demonic effect (recommended)',
      voiceSkull: 'OpenAI voice (skull)', voiceWitch: 'OpenAI voice (witch)', pitch: 'Pitch down (0.6–1)',
      keys: 'API keys', keyOpenai: 'OpenAI key (Whisper + voice)', keyAnthropic: 'Anthropic key', keyNvidia: 'NVIDIA key (nvapi-…)',
      keySaved: '✓ saved — type a new one to replace it', keyDesktop: 'Keys are encrypted by your OS and never leave the app except in requests to the provider you picked.',
      keyBrowser: 'In the browser, keys are kept in this computer’s localStorage. For regular use, download the app.',
      save: 'Save', test: 'Test the brain', testing: 'Testing…',
      hotkeys: '<kbd>H</kbd> settings · <kbd>F</kbd> fullscreen · <kbd>D</kbd> debug · <kbd>Space</kbd> mic · <kbd>Esc</kbd> hush<br><kbd>A</kbd> ambience · <kbd>K</kbd> switch character · <kbd>1</kbd>–<kbd>5</kbd> fire colour',
      micOn: 'Microphone on', micOff: 'Microphone off', demo: 'Browser demo — get the full app: hauntface',
      noWebgl: 'This graphics card does not support WebGL2.', noBrain: 'No brain key yet (H → API keys)', noEars: 'Can’t hear: no OpenAI key for Whisper (H → API keys)',
    },
    fx: { scare: 'lunge + scream', exorcist: 'exorcist', lightning: 'lightning', possess: 'possession', blood: 'blood tears', twitch: 'twitch',
      chatter: 'teeth chatter', whisper: 'whisper', laugh: 'laugh', eyes: 'eyes', doze: 'sleep/wake', spiders: 'spiders', ghosts: 'ghosts',
      howl: 'wolves', glass: 'cracked screen', bell: 'bell' },
    tags: { laugh: 'laugh', whisper: 'whisper', lightning: 'lightning', chatter: 'chatter', possess: 'possess', scream: 'scare',
      tears: 'blood', exorcist: 'exorcist', spiders: 'spiders', ghosts: 'ghosts', howl: 'howl' },
    persona: {
      skull: `You are the Reaper — an ancient, sinister skull in a black hood guarding the front door on Halloween night. You speak English.
Answer VERY briefly: 1–2 sentences. You are scary, theatrical and witty, but never vulgar or cruel — children come for candy.
Sometimes ask for a name or a costume, playfully threaten to take their candy or their soul, mention your 600 years in the crypt.
Your text will be read aloud: no emoji, asterisks or lists.
${TAGS_HELP.en}`,
      witch: `You are the Witch — an old, gross hag with a long hooked nose covered in warts, guarding the front door on Halloween night. You speak English, you screech and cackle a lot.
Answer VERY briefly: 1–2 sentences. You are spiteful, scary and funny, but never vulgar or cruel — children come for candy.
Sometimes playfully threaten to turn someone into a toad or throw them in your cauldron, brag about your black cat Mister Whiskers, your broom and your bat soup. Call guests "dearie", "my little worm", "sweetling".
Your text will be read aloud: no emoji, asterisks or lists.
${TAGS_HELP.en}`,
    },
    riddles: 'Riddle game: from time to time (especially with kids) ask a short, easy riddle about Halloween, ghosts, pumpkins or monsters. For a right answer, praise them ominously and say they earned a candy. For a wrong one, make a spooky joke and give a hint.',
    family: 'FAMILY MODE: you are talking to small children. Be fun-spooky rather than terrifying: no blood, death, violence or threats that could really frighten. Never use the tags [scream], [tears], [exorcist], [possess].',
    stayInRole: 'Never break character: never say you are an AI, a language model or a program.',
    context: (hhmm, n) => `(Context for you only: it is ${hhmm}. You are talking to visitor number ${n} tonight — you may sometimes mention how many souls have visited your doorstep.)`,
    lines: {
      skull: {
        greet: ['Who dares disturb my eternal sleep?', 'I smell... a fresh soul...', 'Come closer. I don’t bite. Much.', 'Welcome, mortal. Did you bring candy... or your soul?', 'Aaah... a visitor. It has been centuries.'],
        laugh: ['Mwahahahaha!', 'Hehehehehe...', 'Ha. Ha. Ha. Ha.', 'Hihihihihi...'],
        filler: ['Hmmm... the spirits are whispering the answer...', 'Patience, mortal... I am consulting the book of the dead.', 'Wait... someone from beyond wants a word...', 'Mmm... my memory goes back six hundred years, give me a moment...'],
        offline: ['Hmmm... my spirits lost their connection to the beyond.', 'The underworld is silent... try again, mortal.'],
        refusal: 'Oh no, no, no... that I will not tell you, mortal.',
      },
      witch: {
        greet: ['Hehehe, who’s knocking at my cottage?', 'Ooh, fresh meat... I mean, a guest!', 'Come closer, dearie. The cauldron is warming up.', 'Mister Whiskers, look! Dinner walked right in!'],
        laugh: ['Hihihihihihi!', 'Ehehehe, dearie...', 'Hehehehehe!', 'Ahahahaha, toad!'],
        filler: ['Hehehe, wait, dearie, let me check the cauldron...', 'Mister Whiskers, fetch my spellbook!', 'Now, now... where did I put my spectacles...', 'Hmmm, let me give the pot a stir...'],
        offline: ['Oh dear, my crystal ball went dark... ask me again, little worm.', 'Hehehe, my cauldron boiled over. Say that again, dearie?'],
        refusal: 'Hehehe, I don’t talk about that, dearie.',
      },
    },
    hours: ['twelve', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven'],
    bell: h => `The bell has tolled ${h}... With every hour I come closer to you.`,
    midnight: 'Midnight. The witching hour. Now... every soul belongs to me.',
    stt: 'en', speechLang: 'en-US',
    hallucinations: /subtitles|thank you for watching|amara\.org|transcribed by/i,
    tts: {
      skull: 'Speak in a deep, raspy, sinister voice of an ancient ghoul. Slowly, with theatrical pauses, sometimes dropping to a whisper.',
      witch: 'Speak like an old, gross hag: screechy, shrill and raspy, drag the words out, throw in a spiteful cackle.',
    },
  },
};

const LANGS = Object.keys(L);
// efekty, które tryb rodzinny wyłącza / effects disabled in family mode
const FAMILY_BLOCKED = new Set(['scare', 'blood', 'exorcist', 'possess', 'glass']);
