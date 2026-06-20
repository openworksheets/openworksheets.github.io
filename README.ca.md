# OpenWorksheets

> [Versión en español](README.es.md) · [English version](README.md)

OpenWorksheets és una aplicació web per convertir PDFs o imatges en fitxes interactives autocorrectores, de manera semblant a TopWorksheets. El professorat pot pujar un document, col·locar-hi a sobre diferents tipus de camps de resposta i configurar les solucions, la puntuació, les opcions de correcció i les restriccions d'accés. També permet crear fitxes des d'un full en blanc, sense necessitat de carregar cap PDF o imatge.

## Tipus de camp

En l'editor, els camps s'agrupen a la paleta de l'esquerra en cinc categories segons el que ha de fer l'alumnat.

### 💬 Respondre

Camps en els quals l'alumnat aporta la seva pròpia resposta oberta (l'escriu o la grava).

| Tipus | Descripció |
|-------|------------|
| **Resposta curta** | L'alumnat escriu text lliure. Admet diverses respostes correctes alternatives i opcions de normalització (accents, majúscules, espais). |
| **Fórmula** | L'alumnat escriu una fórmula matemàtica o química amb l'editor visual **EdiCuaTeX** (botó «fx») i en veu la representació renderitzada en viu sota el camp. S'autocorregeix: compara el LaTeX ignorant espais i delimitadors (les majúscules sí compten) i admet diverses respostes acceptades. |
| **Resposta numèrica** | L'alumnat introdueix un número. Accepta coma o punt com a separador decimal i permet definir una tolerància d'error. |
| **Resposta llarga** | L'alumnat escriu una resposta extensa amb format (**negreta**, *cursiva*, enllaços) i fórmules, amb vista prèvia en viu (Markdown + LaTeX) i **comptador de paraules**. El docent pot fixar un **límit de paraules** opcional. No s'autocorregeix: el docent posa la nota en revisar el lliurament (queda *pendent* fins llavors). |
| **Taula editable** | L'alumnat omple una taula. Cada cel·la pot ser de **text** o **número** (amb tolerància ±), tenir diverses respostes vàlides alternatives i marcar-se com a **exemple visible** (es mostra ja resolta i no puntua). Una cel·la es pot **convertir en desplegable**: les seves respostes s'ofereixen com a opcions i es marca quina és la correcta. Les respostes es poden **enganxar des d'un full de càlcul** (Calc, Sheets, Excel o CSV) i la correcció es pot fer cel·la a cel·la o per **files/columnes completes** (útil per classificar). |
| **Omplir buits** | L'alumnat omple paraules o frases que falten. Dos modes: *escriure un text amb buits* (marcats amb claudàtors en l'enunciat) o *marcar buits sobre el document* (dibuixant un quadre sobre cada buit que ja existeix al PDF o imatge). Admet diverses respostes vàlides per buit i puntuació proporcional. |
| **Enregistrament de veu** | L'alumnat grava la seva veu amb el micròfon. No s'autocorregeix: es valora *manualment* (el docent posa la nota en revisar el lliurament) o per *participació* (gravar quelcom atorga els punts complets). L'àudio viatja dins del lliurament; per la seva mida, la seva presència deshabilita el lliurament per enllaç (queda només la descàrrega de fitxer). Durada màxima configurable. |

### ☑️ Triar

Camps en els quals l'alumnat selecciona entre opcions predefinides.

| Tipus | Descripció |
|-------|------------|
| **Opció única** | Llista d'opcions en la qual l'alumnat en tria una sola. |
| **Opció múltiple** | Llista d'opcions en la qual l'alumnat pot marcar-ne diverses. Admet puntuació parcial. |
| **Caselles de verificació** | Caselles dibuixades lliurement sobre el document. Mode individual o múltiple amb puntuació parcial opcional. |
| **Vertader / fals** | Dos botons amb etiquetes configurables (p. ex. Sí / No, Correcte / Incorrecte). |
| **Desplegable** | L'alumnat tria una opció d'un menú desplegable. Ocupa poc espai visual. |

### 🔗 Relacionar

Camps en els quals l'alumnat connecta, ordena o col·loca elements.

| Tipus | Descripció |
|-------|------------|
| **Emparellar** | Dues columnes d'elements que l'alumnat relaciona entre si. |
| **Ordenar** | L'alumnat arrossega elements per posar-los en l'ordre correcte. |
| **Arrossegar a zones** | L'alumnat arrossega elements fins a les zones de destinació dibuixades sobre el document. Dos modes: *escriure les etiquetes* (que parteixen d'una safata) o *retallar del propi PDF* trossos de text o imatge (que parteixen del seu lloc i el deixen buit en moure'ls). |
| **Unir amb fletxes** | L'alumnat connecta elements dibuixant fletxes entre ells directament sobre la pàgina. |

### 📦 Interactiu

Contingut interactiu extern: webs incrustades i paquets SCORM (el SCORM puntua; «Inserir» és informatiu).

| Tipus | Descripció |
|-------|------------|
| **Inserir (Web/HTML)** | Contingut extern. En crear-lo es tria el tipus: **URL** (s'incrusta en un iframe), **codi HTML** d'inserció (Genially, H5P, mapes…), **web completa en `.zip`** (un `index.html` amb les seves carpetes/CSS/JS, servida des de la pròpia fitxa), **paquet `.elpx` d'eXeLearning** (un `.zip` amb una web a dins) o **paquet IMS Content Package** (`.zip` amb `imsmanifest.xml`, amb el seu menú de navegació). Admet títol i peu. |
| **SCORM (1.2)** | El docent puja un paquet **SCORM 1.2** (`.zip`). OpenWorksheets actua com a mini‑LMS al navegador: mostra el **menú de navegació** del paquet, executa els seus continguts i captura la seva **puntuació** (`cmi.core.score.raw`) o el seu estat de finalització, que s'integra a la nota de la fitxa de forma proporcional als punts del camp. Admet **títol i peu** opcionals (amb tipus de lletra, mida i color). El paquet es veu **en viu al propi llenç de l'editor** (sense interacció, per poder-lo moure i redimensionar) i de forma interactiva en la vista prèvia. |

#### Notes sobre SCORM

- **Només SCORM 1.2** (no SCORM 2004 ni seqüenciació avançada). En pujar un paquet 2004 s'avisa i no s'importa.
- **Requereix obrir la fitxa des d'un lloc web (https)**: el paquet es serveix mitjançant un *Service Worker*, que no està disponible en obrir els HTML com a fitxer local (`file://`).
- Dos modes de puntuació: **nota del SCORM** (utilitza `score.raw` normalitzat entre `score.min`/`score.max`) o **aprovat/suspès** (segons `lesson_status`).
- El paquet viatja **dins del ZIP** de la fitxa, per la qual cosa n'augmenta la mida.
- El contingut SCORM executa JavaScript propi al navegador de l'alumnat; la sessió **no es reprèn** entre recàrregues (es reinicia l'intent).

> Hi ha un paquet SCORM 1.2 d'exemple a `ejemplos/scorm-ejemplo.zip` (una pregunta que reporta la seva puntuació) per provar la pujada des de l'editor.

### 🎨 Disseny

Elements decoratius o informatius que no es corregeixen ni compten en la puntuació.

| Tipus | Descripció |
|-------|------------|
| **Text** | Bloc de text fix (títols, instruccions, notes) amb edició **Markdown**: negreta, cursiva, títols, llistes i enllaços, amb commutador entre edició i vista. Admet **fórmules LaTeX** (vegeu més avall). |
| **Imatge** | Imatge decorativa o explicativa superposada al document. |
| **Vídeo** | Vídeo de YouTube/Vimeo (incrustat), enllaç directe o fitxer pujat, amb títol i peu opcionals. |
| **Àudio** | Àudio des de fitxer pujat o enllaç, amb títol i peu opcionals. |
| **Tapar zona** | Rectangle de color que oculta una part del document (respostes, pistes, etc.). |
| **Línia / Fletxa** | Línia recta amb puntes de fletxa opcionals (cap, una o dues) per assenyalar o connectar elements. |
| **Polígon** | Polígon regular amb el nombre de costats que es triï (triangle, rombe, pentàgon, hexàgon…), amb vora, farciment i rotació. |
| **Rectangle / El·lipse** | Formes geomètriques per ressaltar o emmarcar, amb vora, farciment i cantonades arrodonides (rectangle). |

Tots els camps amb text comparteixen ajustos de **tipus de lletra** (amb una font global de la fitxa i possibilitat de canviar-la per camp, inclosa OpenDyslexic), mida i color. Cada camp permet fixar la seva **mida exacta** (amplada i alçada en %) a més d'ajustar-la amb el ratolí, i les formes, la imatge i el text admeten **rotació**. L'editor inclou una **tira de miniatures** per navegar i reordenar pàgines, **menús contextuals** (clic dret) per copiar, retallar, enganxar, duplicar i esborrar camps i pàgines, **desfer/refer** (Ctrl+Z / Ctrl+Y) i **zoom** fins al 500 % (Ctrl+roda) amb desplaçament arrossegant la fitxa.

### 🧮 Fórmules matemàtiques i química (LaTeX)

Qualsevol text de la fitxa admet **fórmules LaTeX**, que es renderitzen automàticament en mostrar-se a l'alumnat: el títol i les instruccions, el camp **Text**, les opcions de resposta, els encapçalaments i les cel·les de la **Taula editable**, etc.

- **En línia:** escriu la fórmula entre `\(` i `\)` — per exemple, `\(\frac{1}{2}\)` o `\(E = mc^2\)`.
- **En bloc (centrada):** entre `\[` i `\]` — per exemple, `\[\int_0^1 x^2\,dx\]`.

Funciona amb tot el repertori habitual: fraccions, arrels, sumatoris i integrals, **matrius**, fletxes, símbols, etc., i amb **química** mitjançant `mhchem` (`\(\ce{H2O}\)`, `\(\ce{2H2 + O2 -> 2H2O}\)`).

El renderitzat usa MathJax amb sortida SVG: es carrega només quan la fitxa conté fórmules i **funciona sense connexió**, també dins dels paquets SCORM, IMS CP i de l'exportació a web.

#### Assistent de fórmules (EdiCuaTeX)

Per facilitar l'escriptura de fórmules matemàtiques o químiques sense necessitat de conèixer la sintaxi de LaTeX, l'editor integra l'eina d'edició visual **EdiCuaTeX**:

1. **Botó `fx`:** Quan enfoquis qualsevol camp de text que admeti LaTeX al panell lateral (com enunciats, textos d'ajuda, opcions de resposta, etc.), apareixerà el botó **`fx`** a la capçalera del panell (o prement la drecera `Ctrl+Shift+F`).
2. **Edició visual:** En fer-hi clic, s'obrirà un editor visual en finestra emergent d'[EdiCuaTeX](https://edicuatex.github.io/). Si tenies text seleccionat al camp, es carregarà automàticament per poder-lo editar; als camps **Fórmula** (tant les fórmules acceptades de l'editor com el camp que omple l'alumnat), si no selecciones res es carrega tota la fórmula ja escrita i es reemplaça en inserir.
3. **Inserció automàtica:** Un cop dissenyada la fórmula, en prémer el botó d'inserció a EdiCuaTeX, aquesta s'enganxarà automàticament al teu camp de text de l'editor d'OpenWorksheets embolicada en els delimitadors de línia estàndard `\(` i `\)`.

### 📊 Taules editables

El tipus de camp **Taula editable** permet crear graelles estructurades d'entrada de dades (fins a un màxim de **12 files i 8 columnes**) perquè l'alumnat les completi.

#### Característiques i configuració avançada:
- **Tipus de cel·la individuals:** Cada cel·la de la taula es pot configurar de forma independent amb els tipus següents:
  - **Text:** Per a respostes alfanumèriques. Permet múltiples alternatives correctes i normalitzacions (accents, majúscules, etc.).
  - **Número:** Per a respostes numèriques, amb possibilitat de definir una **tolerància d'error** (p. ex. `±0.1`).
  - **Desplegable:** Converteix la cel·la en una llista d'opcions. Les respostes correctes alternatives es mostren com les opcions del desplegable i es marca quina és la solució activa.
- **Cel·les d'exemple:** Qualsevol cel·la es pot marcar com a *Exemple*. Es mostrarà omplerta amb la solució a l'alumnat, no serà editable i no comptarà per a la puntuació.
- **Modes de correcció:** Des dels ajustos del panell, la correcció de la taula es pot configurar en tres modalitats:
  - **Cel·la a cel·la:** Cada resposta correcta suma punts de forma independent.
  - **Per files completes:** Tota la fila ha de ser correcta per puntuar (ideal per a classificacions o relacionar conceptes en una mateixa línia).
  - **Per columnes completes:** Tota la columna ha de completar-se correctament per puntuar.
- **Importació des de Fulls de Càlcul:** Pots copiar dades directament des d'Excel, Google Sheets, Calc o un fitxer CSV i enganxar-les al botó d'importació de la taula per omplir automàticament l'estructura i els continguts.
- **Editor a pantalla completa:** Per a taules grans, pots obrir l'editor de taules en pantalla completa mitjançant el botó corresponent del panell lateral per treballar amb més comoditat.

## Creació de fitxes amb IA

OpenWorksheets pot generar una fitxa completa automàticament a partir d'un formulari que omple el docent. No requereix compte ni API externa: el procés és íntegrament per copiar/enganxar:

1. Obre **Fitxer → Crear amb IA…** (o fes clic a l'opció de la pantalla inicial).
2. Omple el formulari: tema, nivell, nombre de preguntes, idioma, tipus de camp permesos i fons (color, imatge o PDF).
3. OWS genera un prompt estructurat. Copia'l i enganxa'l en qualsevol xat d'IA (ChatGPT, Gemini, Copilot, Claude…).
4. Enganxa la resposta JSON de la IA de tornada a OWS. La valida i importa, col·locant els camps automàticament amb separació ajustada entre enunciat i resposta i paginant segons faci falta.
5. Edita el resultat com qualsevol altra fitxa.

També pots inserir pàgines generades amb IA en una fitxa ja començada usant el botó **«+ IA»** que apareix entre pàgines.

## Flux de treball

1. **Crear:** el professorat puja un PDF o imatge, o comença amb un full en blanc, col·loca els camps i configura les respostes correctes i la puntuació a l'editor.

### Correcció de respostes de text

Els camps basats en text (com **Resposta curta**, **Omplir buits**, **Buits al document** i les cel·les de **Taula editable**) segueixen el mateix esquema de correcció:

- Es poden definir **diverses respostes vàlides alternatives**.
- Les opcions **Ignorar majúscules i minúscules**, **Ignorar accents** i **Ignorar espais sobrants** s'apliquen a totes aquestes alternatives.

Això significa que no cal afegir variants que només canvien per accents o majúscules si aquestes opcions estan activades. Per exemple, amb **Ignorar accents**, `mamífer` i `mamifer` ja es consideren equivalents. Les alternatives serveixen per a casos com `oceà` / `mar`, `satèl·lit` / `lluna` o `carnívor` / `carnívora` si vols acceptar formes diferents amb significat vàlid.

2. **Compartir:** la fitxa s'exporta com un paquet `.owpkg` (OpenWorksheets Package, internament un ZIP) que conté tot el necessari. Es puja a Google Drive o un altre allotjament públic i es comparteix amb l'alumnat mitjançant un enllaç generat a la pròpia aplicació. L'alumnat no té accés al paquet original, la qual cosa protegeix el contingut.
3. **Respondre i lliurar:** l'alumnat respon des del navegador i, en acabar, pot descarregar un fitxer de lliurament (`.owsub`) o copiar un enllaç directe per enviar-lo al docent.

> **Alternativa: exportar com a SCORM 1.2.** Des de *Fitxer → Exportar com a… → SCORM 1.2* la fitxa s'empaqueta com un ZIP SCORM autònom que es puja a **Moodle** o a qualsevol LMS compatible com a activitat SCORM. En aquest mode el LMS gestiona la nota, els intents i el progrés: el visor li envia la puntuació (0–100), l'estat (aprovat/suspès o completat) i el temps de sessió segons l'estàndard SCORM 1.2. La nota mínima per aprovar i el mode d'estat es configuren a la pestanya **«SCORM»** dels ajustos de la fitxa. No usa el fitxer de lliurament ni l'enllaç de lliurament (els substitueix el LMS).

> **Alternativa: exportar com a IMS Content Package.** Des de *Fitxer → Exportar com a… → IMS CP* la fitxa s'empaqueta com un ZIP IMS CP 1.1.4 (amb `imsmanifest.xml`) per a repositoris i plataformes compatibles. A diferència del SCORM, no inclou seguiment ni qualificació.

> **Alternativa: exportar com a pàgina web autònoma.** Des de *Fitxer → Exportar com a… → Exportar a web (ZIP)* la fitxa s'empaqueta com un ZIP amb una còpia del visor i un `index.html`. N'hi ha prou amb descomprimir-lo i pujar el seu contingut a qualsevol allotjament web propi per tenir-lo funcionant sense dependre d'OpenWorksheets ni de Google Drive. Conserva la contrasenya d'accés i el xifratge de lliurament de la fitxa. L'alumnat respon i, en acabar, descarrega el seu fitxer de lliurament (`.owsub`) o copia l'enllaç de lliurament. El propi `index.html` del paquet reconeix aquests enllaços i obre un **panell de correcció** on el docent va acumulant els lliuraments en una taula amb resum i exportació a CSV (enganxant diversos enllaços o obrint fitxers `.owsub`), igual que al web oficial; amb `#corregir` s'obre el panell buit. Així el web és totalment autònom. S'ha de servir per http(s): no funciona obrint el `index.html` com a fitxer local.

## Lliuraments i verificació

El docent pot obrir els fitxers de lliurament des de la pàgina principal per veure la puntuació, les respostes i comprovar automàticament que no han estat modificats. És possible carregar múltiples fitxers alhora o rebre'ls mitjançant l'enllaç que genera l'alumnat en acabar. Els resultats de tota una classe es mostren en una taula ordenable i es poden exportar a CSV.

Les respostes que no s'autocorregeixen —els **enregistraments de veu** en mode *manual*— apareixen com a **pendents**: en obrir el lliurament, el docent reprodueix cada àudio i escriu la seva puntuació, i la nota total, la nota sobre 10, el percentatge i el CSV de la classe es recalculen a l'instant. Aquests ajustos es guarden localment al navegador del docent **sense modificar el lliurament original** de l'alumnat, per la qual cosa la seva verificació d'integritat continua sent vàlida.

La verificació d'integritat és automàtica i avisa si algun fitxer ha estat manipulat. Els lliuraments també es poden xifrar perquè només el docent els pugui llegir (vegeu [Seguretat i xifratge](#seguretat-i-xifratge)).

## Control d'accés

Les fitxes admeten les opcions de control següents:

- Data i hora d'inici i de finalització
- Contrasenya d'accés
- Temps límit per intent
- Nombre màxim d'intents
- Lliurament automàtic en esgotar el termini
- Opció de mostrar o amagar la nota i la correcció a l'alumnat

### Supervisió durant la realització

De forma opcional, les fitxes es poden fer sota una supervisió lleugera (tot al navegador; no pot impedir del tot que un usuari decidit canviï de dispositiu):

- **Mantenir la pantalla completa**: la fitxa s'obre a pantalla completa i torna a sol·licitar-la quan l'alumnat fa clic després de sortir-ne.
- **Què fer si l'alumnat surt de la pestanya, finestra o pantalla completa**: permetre-ho, mostrar un avís o avisar **i registrar** la incidència al lliurament.
- **Lliurament automàtic** després d'un nombre configurable d'incidències (0 = mai).

A l'alumnat se l'informa de les regles a la pantalla d'inici (sense revelar quantes sortides forcen l'enviament automàtic), els avisos apareixen com un missatge centrat que roman fins que es tanca, i els lliuraments amb incidències es destaquen a la taula de resultats del docent.

## Seguretat i xifratge

OpenWorksheets ofereix un nivell de seguretat alt per a l'ús a l'aula: l'alumnat no pot accedir al fitxer de la fitxa i els lliuraments es poden xifrar perquè només el docent els pugui llegir. Incorpora dos mecanismes de xifratge **independents**, tots dos executats íntegrament al navegador mitjançant la Web Crypto API (`crypto.subtle`), sense servidor ni enviament de dades a tercers.

### Xifratge de lliuraments (clau pública)

Pensat perquè **només el docent** pugui llegir el que lliura l'alumnat.

- En activar-lo, el docent fixa una contrasenya i l'aplicació genera un parell de claus **RSA-OAEP de 2048 bits** (SHA-256). La clau pública s'incrusta a la fitxa; la clau privada es guarda **xifrada** amb **AES-GCM de 256 bits**, usant una clau derivada de la contrasenya del docent mitjançant **PBKDF2-SHA256 amb 250 000 iteracions** i sal aleatòria.
- Quan l'alumnat lliura, l'aplicació genera una clau AES-GCM aleatòria, xifra el lliurament amb ella i, al seu torn, xifra aquesta clau amb la clau pública RSA (esquema híbrid). L'alumnat pot **xifrar però no desxifrar**.
- Només el docent, introduint la seva contrasenya, recupera la clau privada i desxifra els lliuraments.

Avantatge: encara que el fitxer de lliurament (`.owsub`) o l'enllaç de lliurament siguin interceptats, el seu contingut roman il·legible sense la contrasenya del docent.

### Xifratge de la fitxa (protecció de les solucions)

Protegeix el contingut de la fitxa —especialment les respostes correctes, que viatgen dins del fitxer— davant de qui obtingui el paquet `.owpkg` sense autorització.

- El contingut sensible del manifest (instruccions, ajustos, pàgines amb solucions, configuració d'accés…) es xifra amb **AES-GCM de 256 bits**, amb clau derivada de la contrasenya d'accés per **PBKDF2-SHA256 (250 000 iteracions)**. Només queden en clar dades no sensibles (títol, idioma i identificador).
- La contrasenya d'accés compleix doble funció: dóna accés a la fitxa i desxifra el seu contingut.

### Implicacions de seguretat

Convé entendre bé el model, perquè condiciona què protegeix i què no:

- **Tota la seguretat recau en la contrasenya.** Com que no hi ha servidor, la clau privada xifrada i les dades xifrades viatgen dins de fitxers que poden acabar en mans de tercers. Qui obtingui un d'aquests fitxers pot intentar un **atac de diccionari sense connexió**. Les 250 000 iteracions de PBKDF2 encareixen molt cada intent, però **una contrasenya feble continua sent vulnerable**. Usa contrasenyes llargues i úniques.
- **No hi ha recuperació.** Si es perd la contrasenya, els lliuraments xifrats i la fitxa xifrada són **irrecuperables**: no existeix restabliment ni porta del darrere.
- **El xifratge de la fitxa no és DRM.** Protegeix les solucions davant de qui **no** té la contrasenya (per exemple, un paquet filtrat públicament). No protegeix davant d'un alumne que **sí** rep la contrasenya d'accés, ja que aquesta mateixa contrasenya desxifra el manifest: tècnicament podria extreure les respostes. Evita la fuga accidental del fitxer, no a un usuari autoritzat i maliciós.
- **Integritat garantida.** AES-GCM és xifratge autenticat: qualsevol manipulació del text xifrat es detecta en desxifrar. Els lliuraments, a més, inclouen verificació d'integritat que avisa si un fitxer ha estat alterat.
- **Límit inherent a les aplicacions de client.** Com que tot s'executa al navegador de l'alumnat, el xifratge protegeix les dades **en repòs** (els fitxers), però no impedeix que un usuari amb coneixements tècnics inspeccioni o manipuli la seva pròpia sessió en execució. Per això OpenWorksheets és adequat per a l'aula, però **no substitueix un sistema d'examen d'alta seguretat** amb supervisió i backend de confiança.

## Idiomes

La interfície està disponible en català, castellà, gallec, basc i anglès.

## Tecnologia

Funciona sense servidor, sense comptes i sense instal·lacions. És una aplicació web estàtica en JavaScript vanilla (mòduls ES, sense framework ni pas de compilació), compatible amb qualsevol navegador modern.

Les úniques dependències són biblioteques locals que viatgen amb l'aplicació, per la qual cosa tot funciona **sense connexió** (també als paquets SCORM, IMS CP i d'exportació a web):

- **[pdf.js](https://mozilla.github.io/pdf.js/)** — converteix cada pàgina del PDF en imatge en importar.
- **[JSZip](https://stuk.github.io/jszip/)** — llegeix i escriu els paquets `.owpkg`, `.owsub` i els ZIP d'exportació.
- **[MathJax](https://www.mathjax.org/)** (component *tex-svg*) — renderitza les fórmules LaTeX i químiques a SVG; es carrega només quan la fitxa conté fórmules.

El xifratge usa la **Web Crypto API** del navegador (sense biblioteca externa).

## Llicència

[AGPLv3](LICENSE) · © Juan José de Haro
