# OpenWorksheets

OpenWorksheets is a web application for converting PDFs or images into interactive, self-grading worksheets, similar to TopWorksheets. Teachers can upload a document, place different types of answer fields on top of it, and configure the correct answers, scoring, grading options, and access restrictions. It also allows creating worksheets from a blank page, without needing to load a PDF or image first.

## Field types

In the editor, fields are grouped in the left palette into five categories based on what the student needs to do.

### 💬 Answer

Fields where the student provides their own open response (typed or recorded).

| Type | Description |
|------|-------------|
| **Short answer** | The student writes free text. Supports multiple alternative correct answers and normalization options (accents, case, spaces). |
| **Formula** | The student writes a math or chemistry formula with the **EdiCuaTeX** visual editor (the "fx" button) and sees it rendered live below the field. Auto-graded: the LaTeX is compared ignoring spaces and delimiters (case matters), and several accepted answers can be defined. |
| **Numeric answer** | The student enters a number. Accepts comma or period as decimal separator and allows defining an error tolerance. |
| **Long answer** | The student writes an extended response with formatting (**bold**, *italics*, links) and formulas, with a live preview (Markdown + LaTeX) and a **word counter**. The teacher can set an optional **word limit**. Not auto-graded: the teacher assigns the score when reviewing the submission (it stays *pending* until then). |
| **Editable table** | The student fills in a table. Each cell can be **text** or **number** (with ± tolerance), have multiple valid alternative answers, and be marked as a **visible example** (shown already filled in and not scored). A cell can be **converted to a dropdown**: its answers are offered as options and the correct one is marked. Answers can be **pasted from a spreadsheet** (Calc, Sheets, Excel or CSV) and grading can be done cell by cell or by **complete rows/columns** (useful for classification). |
| **Fill in the blanks** | The student fills in missing words or phrases. Two modes: *write a text with blanks* (marked with brackets in the prompt) or *mark blanks on the document* (by drawing a box over each blank already present in the PDF or image). Supports multiple valid answers per blank and proportional scoring. |
| **Voice recording** | The student records their voice with the microphone. Not auto-graded: evaluated *manually* (the teacher assigns the score when reviewing the submission) or by *participation* (recording anything awards full points). The audio travels within the submission; due to its size, its presence disables link-based submission (only file download remains). Maximum duration is configurable. |

### ☑️ Choose

Fields where the student selects from predefined options.

| Type | Description |
|------|-------------|
| **Single choice** | A list of options from which the student picks one. |
| **Multiple choice** | A list of options from which the student can select several. Supports partial scoring. |
| **Checkboxes** | Checkboxes drawn freely over the document. Single or multiple mode with optional partial scoring. |
| **True / False** | Two buttons with configurable labels (e.g. Yes / No, Correct / Incorrect). |
| **Dropdown** | The student picks an option from a dropdown menu. Takes up minimal visual space. |

### 🔗 Match

Fields where the student connects, orders, or places elements.

| Type | Description |
|------|-------------|
| **Matching** | Two columns of elements that the student connects to each other. |
| **Ordering** | The student drags elements to put them in the correct order. |
| **Drag to zones** | The student drags elements to target zones drawn on the document. Two modes: *write the labels* (which start from a tray) or *cut from the PDF itself* pieces of text or image (which start from their position and leave it empty when moved). |
| **Connect with arrows** | The student connects elements by drawing arrows between them directly on the page. |

### 📦 Interactive

External interactive content: embedded websites and SCORM packages (SCORM scores; "Embed" is informational).

| Type | Description |
|------|-------------|
| **Embed (Web/HTML)** | External content. When creating it, choose the type: **URL** (embedded in an iframe), **HTML embed code** (Genially, H5P, maps…), **full website in `.zip`** (an `index.html` with its folders/CSS/JS, served from the worksheet itself), **`.elpx` eXeLearning package** (a `.zip` with a website inside) or **IMS Content Package** (`.zip` with `imsmanifest.xml`, with its navigation menu). Supports optional title and caption. |
| **SCORM (1.2)** | The teacher uploads a **SCORM 1.2** package (`.zip`). OpenWorksheets acts as a mini-LMS in the browser: displays the package's **navigation menu**, executes its content and captures its **score** (`cmi.core.score.raw`) or completion status, which is integrated into the worksheet grade proportionally to the field's points. Supports optional **title and caption** (with font, size and color). The package is shown **live on the editor canvas** (non-interactive, so it can be moved and resized) and interactively in the preview. |

#### SCORM notes

- **SCORM 1.2 only** (no SCORM 2004 or advanced sequencing). Uploading a 2004 package will show a warning and not import it.
- **Requires opening the worksheet from a website (https)**: the package is served via a *Service Worker*, which is not available when opening HTML files locally (`file://`).
- Two scoring modes: **SCORM score** (uses `score.raw` normalized between `score.min`/`score.max`) or **pass/fail** (based on `lesson_status`).
- The package travels **inside the worksheet ZIP**, so it increases its size.
- SCORM content runs its own JavaScript in the student's browser; the session **does not resume** between page reloads (the attempt restarts).

> A sample SCORM 1.2 package is available at `ejemplos/scorm-ejemplo.zip` (a question that reports its score) to test uploading from the editor.

### 🎨 Design

Decorative or informational elements that are not graded and do not count toward the score.

| Type | Description |
|------|-------------|
| **Text** | Fixed text block (titles, instructions, notes) with **Markdown** editing: bold, italic, headings, lists and links, with a toggle between edit and preview. Supports **LaTeX formulas** (see below). |
| **Image** | Decorative or explanatory image overlaid on the document. |
| **Video** | YouTube/Vimeo video (embedded), direct link, or uploaded file, with optional title and caption. |
| **Audio** | Audio from an uploaded file or link, with optional title and caption. |
| **Cover zone** | A colored rectangle that hides part of the document (answers, hints, etc.). |
| **Line / Arrow** | Straight line with optional arrowheads (none, one, or two) for pointing or connecting elements. |
| **Polygon** | Regular polygon with any number of sides (triangle, rhombus, pentagon, hexagon…), with border, fill, and rotation. |
| **Rectangle / Ellipse** | Geometric shapes for highlighting or framing, with border, fill, and rounded corners (rectangle). |

All text fields share **font** settings (with a global worksheet font and the ability to change it per field, including OpenDyslexic), size, and color. Each field allows setting its **exact size** (width and height in %) in addition to adjusting it with the mouse, and shapes, images, and text support **rotation**. The editor includes a **thumbnail strip** for navigating and reordering pages, **context menus** (right-click) for copying, cutting, pasting, duplicating, and deleting fields and pages, **undo/redo** (Ctrl+Z / Ctrl+Y), and **zoom** up to 500% (Ctrl+wheel) with panning by dragging the worksheet.

### 🧮 Math and chemistry formulas (LaTeX)

Any text in the worksheet supports **LaTeX formulas**, which are automatically rendered when displayed to students: the title and instructions, the **Text** field, answer options, headers and cells of the **Editable table**, etc.

- **Inline:** write the formula between `\(` and `\)` — for example, `\(\frac{1}{2}\)` or `\(E = mc^2\)`.
- **Block (centered):** between `\[` and `\]` — for example, `\[\int_0^1 x^2\,dx\]`.

Supports the full standard repertoire: fractions, roots, summations and integrals, **matrices**, arrows, symbols, etc., and **chemistry** via `mhchem` (`\(\ce{H2O}\)`, `\(\ce{2H2 + O2 -> 2H2O}\)`).

Rendering uses MathJax with SVG output: it loads only when the worksheet contains formulas and **works offline**, including inside SCORM, IMS CP, and web export packages.

#### Formula assistant (EdiCuaTeX)

To make writing math or chemistry formulas easier without needing to know LaTeX syntax, the editor integrates the visual editing tool **EdiCuaTeX**:

1. **`fx` button:** When you focus any text field that supports LaTeX in the side panel (such as prompts, help texts, answer options, etc.), the **`fx`** button will appear in the panel header (or press the shortcut `Ctrl+Shift+F`).
2. **Visual editing:** Clicking it opens a visual editor in a popup window from [EdiCuaTeX](https://edicuatex.github.io/). If you had text selected in the field, it will be loaded automatically for editing.
3. **Automatic insertion:** Once the formula is designed, pressing the insert button in EdiCuaTeX will automatically paste it into your OpenWorksheets text field wrapped in the standard inline delimiters `\(` and `\)`.

### 📊 Editable tables

The **Editable table** field type allows creating structured data entry grids (up to **12 rows and 8 columns**) for students to fill in.

#### Features and advanced configuration:
- **Individual cell types:** Each cell in the table can be independently configured with the following types:
  - **Text:** For alphanumeric answers. Supports multiple correct alternatives and normalization (accents, case, etc.).
  - **Number:** For numeric answers, with the option to define an **error tolerance** (e.g. `±0.1`).
  - **Dropdown:** Converts the cell into a list of options. The alternative correct answers are shown as dropdown options and the active solution is marked.
- **Example cells:** Any cell can be marked as an *Example*. It will be displayed filled in with the solution to the student, will not be editable, and will not count toward the score.
- **Grading modes:** From the panel settings, table grading can be configured in three ways:
  - **Cell by cell:** Each correct answer adds points independently.
  - **By complete rows:** The entire row must be correct to score (ideal for classifications or matching concepts on the same line).
  - **By complete columns:** The entire column must be completed correctly to score.
- **Import from Spreadsheets:** You can copy data directly from Excel, Google Sheets, Calc, or a CSV file and paste it into the table import button to automatically fill in the structure and content.
- **Full-screen editor:** For large tables, you can open the table editor in full-screen mode using the corresponding button in the side panel for a more comfortable workflow.

## Workflow

1. **Create:** the teacher uploads a PDF or image, or starts with a blank page, places the fields, and configures the correct answers and scoring in the editor.

### Text answer grading

Text-based fields (such as **Short answer**, **Fill in the blanks**, **Blanks on document**, and **Editable table** cells) follow the same grading scheme:

- **Multiple valid alternative answers** can be defined.
- The options **Ignore case**, **Ignore accents**, and **Ignore extra spaces** apply to all those alternatives.

This means there is no need to add variants that only differ in accents or case if those options are enabled. For example, with **Ignore accents**, `mamífero` and `mamifero` are already considered equivalent. Alternatives are for cases like `ocean` / `sea`, `satellite` / `moon`, or `carnivore` / `carnivorous` when you want to accept different forms with valid meaning.

2. **Share:** the worksheet is exported as an `.owpkg` package (OpenWorksheets Package, internally a ZIP) containing everything needed. It is uploaded to Google Drive or another public host and shared with students via a link generated within the application. Students do not have access to the original package, which protects the content.
3. **Answer and submit:** students answer in the browser and, when done, can download a submission file (`.owsub`) or copy a direct link to send to the teacher.

> **Alternative: export as SCORM 1.2.** From *File → Export as… → SCORM 1.2*, the worksheet is packaged as a standalone SCORM ZIP that can be uploaded to **Moodle** or any compatible LMS as a SCORM activity. In this mode the LMS manages the grade, attempts, and progress: the viewer sends it the score (0–100), status (passed/failed or completed), and session time according to the SCORM 1.2 standard. The minimum passing grade and status mode are configured in the **"SCORM"** tab of the worksheet settings. It does not use the submission file or submission link (these are replaced by the LMS).

> **Alternative: export as IMS Content Package.** From *File → Export as… → IMS CP*, the worksheet is packaged as an IMS CP 1.1.4 ZIP (with `imsmanifest.xml`) for compatible repositories and platforms. Unlike SCORM, it does not include tracking or grading.

> **Alternative: export as a standalone web page.** From *File → Export as… → Export to web (ZIP)*, the worksheet is packaged as a ZIP with a copy of the viewer and an `index.html`. Simply unzip it and upload its contents to any web host to have it running independently of OpenWorksheets or Google Drive. It retains the access password and submission encryption. Students answer and, when done, download their submission file (`.owsub`) or copy the submission link. The package's own `index.html` recognizes those links and opens a **grading panel** where the teacher accumulates submissions in a table with a summary and CSV export (by pasting multiple links or opening `.owsub` files), just like on the official website; `#corregir` opens the empty panel. This makes the website completely self-contained. It must be served over http(s): it does not work when opening `index.html` as a local file.

## Submissions and verification

The teacher can open submission files from the main page to view the score, the answers, and automatically verify they have not been tampered with. Multiple files can be loaded at once or received via the link generated by students when they finish. The results for an entire class are displayed in a sortable table and can be exported to CSV.

Answers that are not auto-graded — **voice recordings** in *manual* mode — appear as **pending**: when opening the submission, the teacher plays each audio and enters the score, and the total grade, grade out of 10, percentage, and class CSV are recalculated instantly. These adjustments are saved locally in the teacher's browser **without modifying the student's original submission**, so its integrity verification remains valid.

Integrity verification is automatic and warns if any file has been tampered with. Submissions can also be encrypted so that only the teacher can read them (see [Security and encryption](#security-and-encryption)).

## Access control

Worksheets support the following control options:

- Start and end date and time
- Access password
- Time limit per attempt
- Maximum number of attempts
- Automatic submission when time expires
- Option to show or hide the grade and corrections to students

### Supervision during the activity

Optionally, worksheets can be done under light supervision (all client-side; it cannot fully prevent a determined user from switching device):

- **Keep fullscreen**: the worksheet opens in fullscreen and re-requests it when the student clicks after leaving it.
- **What to do when the student leaves the tab, window or fullscreen**: allow it, show a warning, or warn **and record** the incident in the submission.
- **Automatic submission** after a configurable number of incidents (0 = never).

Students are told the rules on the start screen (without revealing the number of exits that triggers auto-submission), warnings appear as a centered notice that stays until dismissed, and submissions with incidents are highlighted in the teacher's results table.

## Security and encryption

OpenWorksheets offers a high level of security for classroom use: students cannot access the worksheet file and submissions can be encrypted so that only the teacher can read them. It incorporates two **independent** encryption mechanisms, both running entirely in the browser using the Web Crypto API (`crypto.subtle`), with no server or data sent to third parties.

### Submission encryption (public key)

Designed so that **only the teacher** can read what students submit.

- When enabled, the teacher sets a password and the application generates a **2048-bit RSA-OAEP** key pair (SHA-256). The public key is embedded in the worksheet; the private key is stored **encrypted** with **256-bit AES-GCM**, using a key derived from the teacher's password via **PBKDF2-SHA256 with 250,000 iterations** and a random salt.
- When a student submits, the application generates a random AES-GCM key, encrypts the submission with it, and in turn encrypts that key with the RSA public key (hybrid scheme). Students can **encrypt but not decrypt**.
- Only the teacher, by entering their password, recovers the private key and decrypts the submissions.

Advantage: even if the submission file (`.owsub`) or the submission link is intercepted, its content remains unreadable without the teacher's password.

### Worksheet encryption (solution protection)

Protects the worksheet content — especially the correct answers, which travel inside the file — from anyone who obtains the `.owpkg` package without authorization.

- The sensitive manifest content (instructions, settings, pages with solutions, access configuration…) is encrypted with **256-bit AES-GCM**, with a key derived from the access password via **PBKDF2-SHA256 (250,000 iterations)**. Only non-sensitive data (title, language and identifier) remains in plaintext.
- The access password serves a dual purpose: it grants access to the worksheet and decrypts its content.

### Security implications

It is important to understand the model, as it determines what is and is not protected:

- **All security relies on the password.** Since there is no server, the encrypted private key and encrypted data travel inside files that may end up in the hands of third parties. Anyone who obtains one of those files can attempt an **offline dictionary attack**. The 250,000 PBKDF2 iterations significantly increase the cost of each attempt, but **a weak password remains vulnerable**. Use long, unique passwords.
- **No recovery.** If the password is lost, the encrypted submissions and encrypted worksheet are **irrecoverable**: there is no reset or backdoor.
- **Worksheet encryption is not DRM.** It protects solutions from anyone who does **not** have the password (for example, a publicly leaked package). It does not protect against a student who **does** receive the access password, since that same password decrypts the manifest: they could technically extract the answers. It prevents accidental file leaks, not an authorized and malicious user.
- **Integrity guaranteed.** AES-GCM is authenticated encryption: any tampering with the ciphertext is detected during decryption. Submissions also include integrity verification that warns if a file has been altered.
- **Inherent limitation of client-side applications.** Since everything runs in the student's browser, encryption protects data **at rest** (the files), but does not prevent a technically skilled user from inspecting or manipulating their own running session. For this reason, OpenWorksheets is suitable for the classroom, but **does not replace a high-security examination system** with supervision and a trusted backend.

## Languages

The interface is available in Spanish, English, Catalan, Galician, and Basque.

## Technology

Works without a server, without accounts, and without installation. It is a static web application in vanilla JavaScript (ES modules, no framework or build step), compatible with any modern browser.

The only dependencies are local libraries that travel with the application, so everything works **offline** (including in SCORM, IMS CP, and web export packages):

- **[pdf.js](https://mozilla.github.io/pdf.js/)** — converts each PDF page to an image on import.
- **[JSZip](https://stuk.github.io/jszip/)** — reads and writes `.owpkg`, `.owsub` packages and export ZIPs.
- **[MathJax](https://www.mathjax.org/)** (*tex-svg* component) — renders LaTeX and chemistry formulas to SVG; loaded only when the worksheet contains formulas.

Encryption uses the browser's **Web Crypto API** (no external library).

## License

[AGPLv3](LICENSE) · © Juan José de Haro
