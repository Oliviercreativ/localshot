// Traduction de l'interface : français par défaut, anglais si le navigateur n'est pas en français.
// Les textes sont écrits en français dans le code ; ce module les remplace à l'affichage
// (textes, info-bulles, champs, messages et boîtes de dialogue), y compris ceux ajoutés plus tard.
const lang = (globalThis.chrome?.i18n?.getUILanguage?.() || navigator.language || 'fr').toLowerCase();
export const EN = !lang.startsWith('fr');

const DICT = {
  // Popup et panneau latéral
  'Partie visible': 'Visible area', 'Page entière': 'Full page', 'Zone sélectionnée': 'Selected area', 'Zone': 'Area',
  'Partie visible (⌥⇧V)': 'Visible area (⌥⇧V)', 'Page entière (⌥⇧F)': 'Full page (⌥⇧F)', 'Zone sélectionnée (⌥⇧S)': 'Selected area (⌥⇧S)',
  'Enregistrer une vidéo': 'Record a video', 'Ouvrir la galerie': 'Open gallery', 'Panneau latéral': 'Side panel',
  'Vérification…': 'Checking…', 'Récentes': 'Recent', 'Rechercher…': 'Search…', 'Galerie complète →': 'Full gallery →',
  'Réglages': 'Settings', 'Tout': 'All', 'Photos': 'Photos', 'Vidéos': 'Videos', 'Filtrer': 'Filter',
  'Aucune capture pour l\'instant.': 'No captures yet.', 'Aucune capture pour l\'instant': 'No captures yet',
  'Rechargez LocalShot dans chrome://extensions (bouton ↻) pour activer le panneau latéral.': 'Reload LocalShot in chrome://extensions (↻ button) to enable the side panel.',
  'Chrome n\'autorise la capture que sur un onglet où vous avez cliqué l\'icône LocalShot. Utilisez le raccourci (⌥⇧V, ⌥⇧F ou ⌥⇧S) ou l\'icône pour cet onglet.':
    'Chrome only allows capturing a tab where you clicked the LocalShot icon. Use the shortcut (⌥⇧V, ⌥⇧F or ⌥⇧S) or the icon for this tab.',
  'Ouvrez d\'abord une page web dans cet onglet : Chrome interdit de capturer ses propres pages.': 'Open a web page in this tab first: Chrome does not allow capturing its own pages.',
  'Glissez pour sélectionner une zone · Échap pour annuler': 'Drag to select an area · Esc to cancel',
  // Galerie
  'LocalShot — Mes captures et vidéos': 'LocalShot — My captures and videos', 'Mes captures': 'My captures',
  'Tout télécharger': 'Download all', 'Supprimer': 'Delete', 'Rien à télécharger': 'Nothing to download',
  'Les captures et vidéos sont stockées dans Chrome, sur ce Mac uniquement. Attention : désinstaller l\'extension les efface. Pensez à « Tout télécharger » avant.':
    'Captures and videos are stored in Chrome, on this computer only. Uninstalling the extension deletes them: use “Download all” or auto-save (Settings) first.',
  'Cliquez sur l\'icône LocalShot dans Chrome, ou utilisez les raccourcis :': 'Click the LocalShot icon in Chrome, or use the shortcuts:',
  'partie visible': 'visible area', 'page entière': 'full page', 'zone sélectionnée': 'selected area', 'vidéo (démarrer / terminer)': 'video (start / stop)',
  'Accès au dossier refusé': 'Folder access denied', 'Supprimé': 'Deleted',
  // Page d'une capture
  'Capture — LocalShot': 'Capture — LocalShot', 'Retour à la galerie': 'Back to gallery', 'Titre de la capture': 'Capture title',
  'Annoter': 'Annotate', 'Découper / GIF': 'Trim / GIF', 'Sous-titres': 'Captions', 'Copier l\'image': 'Copy image', 'Télécharger': 'Download',
  'Partager': 'Share', 'Chiffré': 'Encrypted', 'URL source ↗': 'Source URL ↗', 'Revenir à l\'original': 'Revert to original',
  'Lien de partage': 'Share link', 'Copier': 'Copy', 'Arrêter le partage': 'Stop sharing', 'Autoriser et enregistrer': 'Allow and save',
  'Le serveur ne reçoit qu\'un fichier illisible ; la clé voyage dans le lien. Pas d\'aperçu ni de vignette.': 'The server only receives an unreadable file; the key travels in the link. No preview or thumbnail.',
  'Image copiée': 'Image copied', 'Copie impossible': 'Copy failed', 'Lien copié': 'Link copied', 'Titre enregistré': 'Title saved',
  'Partage impossible': 'Sharing failed', 'Partage non arrêté': 'Sharing not stopped', 'Partage arrêté : le lien ne fonctionne plus.': 'Sharing stopped: the link no longer works.',
  'Fichier trop volumineux pour le partage': 'File too large to share', 'Clé d\'accès refusée': 'Access key refused',
  'Aucun serveur de partage réglé': 'No sharing server set', 'Ouvrable par toute personne qui a le lien.': 'Anyone with the link can open it.',
  'Ouvrable seulement depuis vos appareils connectés à Tailscale. Pour un client, il faut une adresse publique (Tailscale Funnel ou serveur en ligne).':
    'Only your devices on Tailscale can open it. For a client you need a public address (Tailscale Funnel or an online server).',
  'Pour partager, indiquez d\'abord votre serveur LocalShot (Raspberry Pi, NAS, VPS ou Docker) dans « Réglages ». Sans serveur, tout reste sur cet ordinateur.':
    'To share, first set your LocalShot server (Raspberry Pi, NAS, VPS or Docker) in Settings. Without a server, everything stays on this computer.',
  'Le serveur refuse l\'accès : vérifiez la clé dans les réglages (bouton « Réglages » de la galerie).': 'The server refused access: check the key in Settings.',
  'Le lien partagé montre encore l\'ancienne version : arrêtez puis relancez le partage.': 'The shared link still shows the old version: stop and share again.',
  'Annotations enregistrées': 'Annotations saved', 'Capture d\'origine restaurée': 'Original capture restored',
  'Revenir à la capture d\'origine ? Les annotations seront perdues.': 'Revert to the original capture? Annotations will be lost.',
  'Revenir à la vidéo d\'origine ? La découpe sera perdue.': 'Revert to the original video? The trim will be lost.',
  'Vidéo découpée': 'Video trimmed', 'Sous-titres prêts': 'Captions ready', 'Aucune parole détectée': 'No speech detected',
  'Supprimer les sous-titres ?': 'Delete the captions?',
  // Découpe et GIF
  'Début': 'Start', 'Fin': 'End', 'Début du segment': 'Segment start', 'Fin du segment': 'Segment end', '← Position actuelle': '← Current position',
  'Découper la vidéo': 'Trim video', 'Exporter en GIF': 'Export GIF', 'Fermer': 'Close', 'Annuler': 'Cancel',
  'Placez-vous dans la vidéo puis « Position actuelle », ou tapez un temps (1:23,5). La découpe rejoue le segment : elle prend autant de temps que lui. Le GIF fait 20 s au plus.':
    'Move in the video then “Current position”, or type a time (1:23.5). Trimming replays the segment, so it takes as long as the segment. GIFs are 20 s max.',
  // Transcription
  'Transcription': 'Transcript', 'cliquez sur une phrase pour la corriger': 'click a sentence to fix it', 'Refaire': 'Redo',
  // Éditeur
  'Annoter la capture': 'Annotate capture', 'Sélection (V)': 'Select (V)', 'Flèche (A)': 'Arrow (A)', 'Cadre (R)': 'Box (R)', 'Texte (T)': 'Text (T)',
  'Étape numérotée (N)': 'Numbered step (N)', 'Flouter une zone (B)': 'Blur an area (B)', 'Masquer une zone (M)': 'Redact an area (M)',
  'Annuler (⌘Z)': 'Undo (⌘Z)', 'Rétablir (⇧⌘Z)': 'Redo (⇧⌘Z)', 'Supprimer l\'élément sélectionné (⌫)': 'Delete selected item (⌫)', 'Enregistrer': 'Save',
  'Fin': 'End', 'Moyen': 'Medium', 'Épais': 'Thick', 'Trait fin': 'Thin stroke', 'Trait moyen': 'Medium stroke', 'Trait épais': 'Thick stroke',
  'Abandonner les annotations ?': 'Discard annotations?', 'Texte de l\'annotation': 'Annotation text',
  'Cliquez sur un élément pour le sélectionner, glissez pour le déplacer, ⌫ pour le supprimer.': 'Click an item to select it, drag to move it, ⌫ to delete it.',
  'Glissez pour tracer une flèche.': 'Drag to draw an arrow.', 'Glissez pour encadrer une zone.': 'Drag to frame an area.',
  'Cliquez où écrire, puis Entrée pour valider.': 'Click where to write, then press Enter.',
  'Cliquez pour poser une étape numérotée (1, 2, 3…).': 'Click to place a numbered step (1, 2, 3…).',
  'Glissez sur une zone à flouter : e-mail, montant, nom… Le flou est définitif dans l\'image enregistrée.': 'Drag over an area to blur: email, amount, name… The blur is permanent in the saved image.',
  'Glissez pour masquer une zone avec un bloc plein.': 'Drag to cover an area with a solid block.',
  // Options du lien et commentaires
  'Options du lien': 'Link options', 'Expire': 'Expires', 'Jamais': 'Never', '24 heures': '24 hours', '7 jours': '7 days', '30 jours': '30 days',
  'Expiration du lien': 'Link expiry', 'Mot de passe': 'Password', 'Retirer': 'Remove', 'Définir': 'Set', 'Aucun': 'None', '🔒 Activé': '🔒 On',
  'Mot de passe du lien': 'Link password', 'Autoriser le téléchargement': 'Allow download', 'Autoriser les commentaires': 'Allow comments',
  'Expiration enregistrée': 'Expiry saved', 'Le lien n\'expire plus': 'The link no longer expires', 'Mot de passe retiré': 'Password removed',
  'Mot de passe défini : communiquez-le séparément du lien': 'Password set: send it separately from the link',
  'Téléchargement autorisé': 'Download allowed', 'Bouton de téléchargement masqué': 'Download button hidden',
  'Commentaires autorisés': 'Comments allowed', 'Commentaires désactivés': 'Comments disabled', 'Commentaires': 'Comments',
  'Aucun commentaire pour l\'instant.': 'No comments yet.', 'Soyez le premier à commenter.': 'Be the first to comment.', 'Envoyer': 'Send',
  'Votre nom': 'Your name', 'Commentaire': 'Comment', 'Votre remarque…': 'Your comment…', 'Votre remarque sur ce moment de la vidéo…': 'Your comment on this moment of the video…',
  'Commentaire envoyé': 'Comment sent', 'Supprimer ce commentaire': 'Delete this comment', 'Supprimer ce commentaire ?': 'Delete this comment?',
  'Suppression impossible': 'Delete failed', 'Anonyme': 'Anonymous', 'Moi': 'Me',
  // Lecteur
  'Lire': 'Play', 'Revoir': 'Replay', 'Lecture (espace)': 'Play (space)', 'Pause (espace)': 'Pause (space)', 'Couper le son (M)': 'Mute (M)',
  'Remettre le son (M)': 'Unmute (M)', 'Volume': 'Volume', 'Vitesse de lecture': 'Playback speed', 'Normale': 'Normal',
  'Image dans l\'image': 'Picture in picture', 'Plein écran (F)': 'Fullscreen (F)', 'Quitter le plein écran (F)': 'Exit fullscreen (F)',
  'Sous-titres (C)': 'Captions (C)', 'Position dans la vidéo': 'Video position',
  // Enregistreur
  'Enregistrer une vidéo — LocalShot': 'Record a video — LocalShot', 'Micro': 'Microphone', 'Caméra': 'Camera', 'Son de l\'onglet': 'Tab audio', 'Effet de clic': 'Click effect',
  'Votre voix': 'Your voice', 'Bulle flottante, visible si vous enregistrez l\'écran entier': 'Floating bubble, visible when recording the entire screen',
  'Le son de la page enregistrée (onglet Chrome uniquement)': 'Audio of the recorded page (Chrome tab only)', 'Un cercle orange à chaque clic dans les pages Chrome': 'An orange circle on every click in Chrome pages',
  '● Choisir quoi enregistrer': '● Choose what to record', 'Chrome vous demandera de choisir un onglet, une fenêtre ou l\'écran entier. Rien n\'est envoyé sur Internet.':
    'Chrome will ask you to pick a tab, a window or the entire screen. Nothing is sent to the Internet.',
  'Chrome vous demandera quoi enregistrer. Choisissez « Onglet Chrome » pour filmer seulement la page, sans les onglets ni le panneau latéral. Rien n\'est envoyé sur Internet.':
    'Chrome will ask what to record. Choose “Chrome Tab” to film only the page, without the tabs or the side panel. Nothing is sent to the Internet.',
  'Enregistrement en cours': 'Recording', '❚❚ Pause': '❚❚ Pause', '■ Terminer': '■ Stop', 'Annuler sans enregistrer': 'Cancel without saving',
  '▶ Reprendre': '▶ Resume', 'En pause': 'Paused', 'Démarrer': 'Start', 'Reprendre': 'Resume', 'Pause': 'Pause', 'Terminer': 'Stop',
  'Supprimer la vidéo ?': 'Delete the video?', 'Affichage': 'Display', 'Ordinateur': 'Desktop', 'Tablette': 'Tablet', 'Mobile': 'Mobile',
  'Sans l\'autorisation de Chrome, LocalShot ne peut pas afficher la page en tablette ou en mobile.': 'Without Chrome\'s permission, LocalShot cannot show the page as a tablet or phone.',
  'Cette page ne peut pas être affichée en tablette ou en mobile : elle est enregistrée telle quelle.': 'This page cannot be shown as a tablet or phone: it is recorded as is.', '📷 Capture d\'écran': '📷 Screenshot', 'Enregistrer l\'image affichée dans la galerie (C)': 'Save the displayed picture to the gallery (C)',
  'Capture impossible': 'Screenshot failed', 'image à': 'frame at', 'Capture d\'écran enregistrée dans la galerie': 'Screenshot saved to the gallery',
  'Exporter': 'Export', 'Exporter ▾': 'Export ▾', 'Exporter la vidéo': 'Export the video',
  'MP4 se lit partout, même sur iPhone. WebM convient bien au web. Le GIF, sans son, reprend les 20 premières secondes : pour un autre passage, coupez d\'abord dans le Studio. Une conversion rejoue la vidéo : elle prend autant de temps qu\'elle.':
    'MP4 plays everywhere, iPhone included. WebM suits the web well. The GIF, without sound, keeps the first 20 seconds: for another part, cut it in the Studio first. A conversion replays the video: it takes as long as the video.',
  'Revenir à la vidéo d\'origine ? Le montage sera perdu.': 'Go back to the original video? The edit will be lost.', 'Pointeur': 'Pointer', 'Numéro': 'Number',
  'Chrome n\'a pas autorisé LocalShot à dessiner sur les pages.': 'Chrome did not allow LocalShot to draw on pages.',
  'Cliquez de nouveau sur l\'outil pour autoriser le dessin.': 'Click the tool again to allow drawing.',
  'Ouvrez une page web dans Chrome pour dessiner dessus.': 'Open a web page in Chrome to draw on it.', 'Impossible de dessiner sur cette page.': 'Cannot draw on this page.', 'Studio': 'Studio', 'Studio vidéo — LocalShot': 'Video studio — LocalShot', 'Retour à la vidéo': 'Back to the video',
  'Annuler (⌘Z)': 'Undo (⌘Z)', 'Rétablir (⇧⌘Z)': 'Redo (⇧⌘Z)', 'Tout réinitialiser': 'Reset all', 
  'Aperçu de la vidéo montée': 'Preview of the edited video', 'Cliquez sur l\'image pour choisir où zoomer': 'Click the picture to choose where to zoom',
  'Lecture (espace)': 'Play (space)', 'Couper au curseur (S)': 'Split at playhead (S)', '✂ Couper ici': '✂ Split here', 'Ajouter un zoom au curseur (Z)': 'Add a zoom at playhead (Z)', '⊕ Zoom': '⊕ Zoom',
  'Passage': 'Clip', 'Passage supprimé': 'Removed clip', 'Vitesse': 'Speed', 'Supprimer ce passage': 'Remove this clip', 'Remettre ce passage': 'Restore this clip',
  'Zoom': 'Zoom', 'Cliquez sur l\'aperçu pour choisir la zone à agrandir.': 'Click the preview to choose the area to magnify.', 'Supprimer ce zoom': 'Delete this zoom',
  'Style': 'Style', 'Fond': 'Background', 'Marges': 'Padding', 'Coins arrondis': 'Rounded corners', 'Ombre': 'Shadow', 'Raccourcis': 'Shortcuts',
  'Aucun': 'None', 'Clair': 'Light', 'Nuit': 'Night', 'Couchant': 'Sunset', 'Océan': 'Ocean', 'Menthe': 'Mint', 'Sable': 'Sand', 'Violet': 'Violet',
  'Timeline': 'Timeline', 'Zooms': 'Zooms', 'Déplacer la coupe': 'Move the cut', 'Export de la vidéo…': 'Exporting the video…',
  'La vidéo est rejouée pour être réenregistrée : comptez sa durée. Tout reste sur votre ordinateur.': 'The video is replayed to be re-recorded: allow its length. Everything stays on your computer.',
  'Annuler l\'export': 'Cancel export', 'Export annulé': 'Export cancelled', 'Échec de l\'export': 'Export failed', 'vidéo illisible': 'unreadable video',
  'Tous les passages sont supprimés.': 'All clips are removed.', 'Gardez au moins un passage.': 'Keep at least one clip.',
  'Placez le curseur plus loin d\'une coupe existante.': 'Move the playhead further from an existing cut.', 'Un zoom existe déjà à cet endroit.': 'There is already a zoom here.',
  'Effacer tout le montage (coupes, vitesses, zooms, style) ?': 'Clear the whole edit (cuts, speeds, zooms, style)?', 'Stylo': 'Pen', 'Flèche': 'Arrow', 'Cadre': 'Box', 'Surligneur': 'Highlighter', 'Couleur': 'Colour',
  'Effacer les annotations': 'Clear annotations', 'Annotations': 'Annotations', 'Dessiner sur la page pendant l\'enregistrement (pages Chrome uniquement)': 'Draw on the page while recording (Chrome pages only)',
  'Sans l\'autorisation de Chrome, impossible de dessiner sur les pages.': 'Without Chrome\'s permission, you cannot draw on pages.',
  'Les annotations ne s\'affichent que sur une page web ouverte dans Chrome.': 'Annotations only show on a web page open in Chrome.', 'Prêt': 'Ready', 'Enregistrement': 'Recording', 'Enregistrement vidéo': 'Video recording',
  '● Démarrer': '● Start', '✕ Annuler': '✕ Cancel', '↗ Détacher la barre': '↗ Detach the bar', '↙ Fermer la barre flottante': '↙ Close the floating bar', '↗ Barre flottante': '↗ Floating bar',
  'Enregistrement de la vidéo…': 'Saving the video…', 'Prêt : cliquez sur Démarrer': 'Ready: click Start', 'Préparez-vous…': 'Get ready…',
  'Enregistrement de la vidéo dans LocalShot…': 'Saving the video in LocalShot…', 'Vidéo': 'Video',
  'Abandonner cet enregistrement ? La vidéo ne sera pas gardée.': 'Discard this recording? The video will not be kept.',
  'Caméra indisponible ou refusée.': 'Camera unavailable or denied.', 'Ce navigateur ne sait pas enregistrer de vidéo.': 'This browser cannot record video.',
  'Micro refusé : la vidéo est enregistrée sans votre voix.': 'Microphone denied: the video is recorded without your voice.',
  'Sans l\'autorisation de Chrome, l\'effet de clic ne peut pas s\'afficher dans les pages.': 'Without Chrome\'s permission, the click effect cannot be shown in pages.',
  'Enregistrement annulé. Si la fenêtre de choix (onglet / fenêtre / écran) ne s\'est pas affichée, vérifiez que Chrome a le droit d\'enregistrer l\'écran dans Réglages Système → Confidentialité et sécurité.':
    'Recording cancelled. If the picker (tab / window / screen) did not appear, check that Chrome may record the screen in System Settings → Privacy & Security.',
  'macOS bloque l\'enregistrement : ouvrez Réglages Système → Confidentialité et sécurité → Enregistrement de l\'écran, autorisez Google Chrome, puis relancez Chrome.':
    'macOS blocks recording: open System Settings → Privacy & Security → Screen Recording, allow Google Chrome, then restart Chrome.',
  // Réglages
  'Réglages — LocalShot': 'Settings — LocalShot', '← Galerie': '← Gallery', 'Dossier de sauvegarde': 'Save folder',
  'Dans Téléchargements': 'In Downloads', ', sous-dossier :': ', subfolder:', 'Dans un dossier de mon choix': 'In a folder of my choice', 'Choisir un dossier…': 'Choose a folder…',
  'Enregistrer automatiquement chaque nouvelle capture et vidéo dans ce dossier': 'Automatically save every new capture and video to this folder',
  'Où LocalShot enregistre vos captures et vidéos sur l\'ordinateur (bouton « Télécharger », « Tout télécharger » et sauvegarde automatique). Une copie sur le disque les protège aussi si l\'extension est désinstallée.':
    'Where LocalShot saves your captures and videos on the computer (Download, Download all and auto-save). A copy on disk also protects them if the extension is uninstalled.',
  'Aucun dossier choisi': 'No folder chosen', 'Sous-titres automatiques': 'Automatic captions', 'Service': 'Service', 'Aucun (désactivé)': 'None (off)',
  'Adresse de l\'API': 'API address', '(compatible OpenAI : /v1/audio/transcriptions)': '(OpenAI-compatible: /v1/audio/transcriptions)', 'Modèle': 'Model',
  'Clé API': 'API key', 'Langue': 'Language', '(facultatif, ex. fr ; vide = détection automatique)': '(optional, e.g. en; empty = auto-detect)',
  'Facultatif. Pour transcrire une vidéo, LocalShot envoie': 'Optional. To transcribe a video, LocalShot sends', 'uniquement le son': 'only the audio',
  'au service choisi, et seulement quand vous cliquez sur « Sous-titres ». Avec « Whisper sur mon serveur », rien ne quitte vos machines.':
    'to the chosen service, and only when you click “Captions”. With “Whisper on my server”, nothing leaves your machines.',
  'Sous-titres désactivés': 'Captions disabled', 'Service de transcription enregistré': 'Transcription service saved', 'Clé API manquante': 'API key missing',
  'Whisper sur mon serveur (100 % local)': 'Whisper on my server (100% local)',
  'Serveur de partage': 'Sharing server', 'Adresse du serveur': 'Server address', 'Clé d\'accès': 'Access key', 'Enregistrer et tester': 'Save and test',
  'Oublier ce serveur': 'Forget this server', 'Réglages enregistrés': 'Settings saved', 'Serveur oublié : plus aucun partage possible': 'Server forgotten: sharing is off',
  'Facultatif. Sans serveur, rien ne quitte cet ordinateur. Pour envoyer des liens, indiquez': 'Optional. Without a server, nothing leaves this computer. To send links, set',
  'votre': 'your', 'serveur LocalShot : Raspberry Pi (adresse Tailscale, par exemple': 'LocalShot server: Raspberry Pi (Tailscale address, for example',
  '), NAS, VPS ou conteneur Docker. Il reçoit': '), NAS, VPS or Docker container. It receives', 'uniquement': 'only', 'les captures que vous partagez.': 'the captures you share.',
  'Chrome vous demandera l\'autorisation d\'accéder à': 'Chrome will ask permission to access', 'cette seule adresse': 'this single address',
  '. La clé reste dans Chrome, sur cet ordinateur. Les captures non partagées ne quittent jamais votre ordinateur.': '. The key stays in Chrome, on this computer. Captures you do not share never leave your computer.',
  'Ce serveur ne semble pas être LocalShot.': 'This server does not look like LocalShot.', 'Serveur joignable, mais la clé d\'accès est incorrecte.': 'Server reachable, but the access key is wrong.',
  'Serveur joignable, mais il refuse l\'accès (clé requise ?).': 'Server reachable, but it refuses access (key required?).',
  'Serveur injoignable. Vérifiez l\'adresse et que Tailscale est connecté sur ce Mac.': 'Server unreachable. Check the address and that Tailscale is connected.',
  'Utilisez une adresse en https:// (http n\'est accepté que sur le réseau local).': 'Use an https:// address (http is only accepted on the local network).',
  'Autorisation refusée : LocalShot ne peut pas joindre ce serveur.': 'Permission denied: LocalShot cannot reach this server.',
  'Autorisation refusée : LocalShot ne pourra pas joindre ce service': 'Permission denied: LocalShot will not be able to reach this service',
  'Adresse invalide.': 'Invalid address.', 'Adresse de l\'API invalide': 'Invalid API address',
  ' Chrome redemandera l\'autorisation au prochain enregistrement (après un redémarrage, par exemple).': ' Chrome will ask permission again on the next save (after a restart, for example).',
  // Pages du serveur (galerie web, liens clients)
  'LocalShot — Captures partagées': 'LocalShot — Shared captures', 'Captures partagées': 'Shared captures', 'Ajouter': 'Add',
  'Installer l\'application': 'Install app', 'Se déconnecter': 'Log out', 'Rechercher une capture…': 'Search captures…',
  'Aucune capture partagée': 'No shared captures', 'Ouvrez une capture dans la galerie de l\'extension et cliquez sur « Partager ».': 'Open a capture in the extension gallery and click “Share”.',
  'Copier le lien': 'Copy link', 'Galerie privée — LocalShot': 'Private gallery — LocalShot', 'Galerie privée': 'Private gallery',
  'La liste des captures n\'est visible que depuis l\'ordinateur qui les a prises.': 'The capture list is only visible to its owner.',
  'Ouvrez un lien de partage (': 'Open a share link (', ') pour voir une capture.': ') to see a capture.',
  'Entrez la clé d\'accès de votre serveur LocalShot. Cet appareil s\'en souviendra.': 'Enter your LocalShot server access key. This device will remember it.',
  'Clé incorrecte.': 'Wrong key.', 'Introuvable — LocalShot': 'Not found — LocalShot', 'Capture introuvable': 'Capture not found',
  'Ce lien n\'existe pas ou la capture a été supprimée.': 'This link does not exist or the capture was deleted.',
  'Lien expiré — LocalShot': 'Link expired — LocalShot', 'Ce lien a expiré': 'This link has expired',
  'Demandez un nouveau lien à la personne qui vous l\'a envoyé.': 'Ask the person who sent it for a new link.',
  'Lien protégé — LocalShot': 'Protected link — LocalShot', 'Lien protégé': 'Protected link', 'Ouvrir': 'Open', 'Mot de passe incorrect.': 'Wrong password.',
  'Cette vidéo est protégée par un mot de passe.': 'This video is password-protected.', 'Cette capture est protégée par un mot de passe.': 'This capture is password-protected.',
  'Accessible uniquement depuis vos appareils connectés à Tailscale.': 'Only reachable from your devices on Tailscale.', 'Accessible par toute personne qui a le lien.': 'Anyone with the link can open it.',
  'Ajouté': 'Added', 'Capture supprimée': 'Capture deleted', 'Formats acceptés : PNG, MP4, WebM': 'Accepted formats: PNG, MP4, WebM',
  'Impossible de déchiffrer': 'Cannot decrypt', 'Lien incomplet': 'Incomplete link', 'Contenu chiffré': 'Encrypted content',
  'La clé de déchiffrement manque à la fin du lien (#k=…). Demandez le lien complet.': 'The decryption key is missing at the end of the link (#k=…). Ask for the full link.',
  'Déposez pour ajouter à LocalShot': 'Drop to add to LocalShot', 'Chargement…': 'Loading…', 'Image indisponible.': 'Image unavailable.',
};

// Messages avec des parties variables.
const PATTERNS = [
  [/^(\d+) éléments? · stockés dans Chrome$/, (m) => `${m[1]} item${m[1] > 1 ? 's' : ''} · stored in Chrome`],
  [/^(\d+) éléments?$/, (m) => `${m[1]} item${m[1] > 1 ? 's' : ''}`],
  [/^(.+) utilisés$/, (m) => `${m[1]} used`],
  [/^Terminer la vidéo \((.+)\)$/, (m) => `Stop video (${m[1]})`],
  [/^En pause \((.+)\)$/, (m) => `Paused (${m[1]})`],
  [/^Enregistré dans Téléchargements(.*)$/, (m) => `Saved to Downloads${m[1]}`],
  [/^Enregistré dans dossier « (.+) »$/, (m) => `Saved to folder “${m[1]}”`],
  [/^(GIF|MP4|WEBM) enregistré dans (.+)$/, (m) => `${m[1]} saved to ${m[2].replace('Téléchargements', 'Downloads').replace(/dossier « (.+) »/, 'folder “$1”')}`],
  [/^GIF enregistré dans (.+)$/, (m) => `GIF saved to ${m[1].replace('Téléchargements', 'Downloads').replace(/dossier « (.+) »/, 'folder “$1”')}`],
  [/^Les fichiers seront enregistrés dans Téléchargements(.*)\.(.*)$/, (m) => `Files will be saved to Downloads${m[1]}.${tr(m[2])}`],
  [/^Les fichiers seront enregistrés dans le dossier « (.+) »\.(.*)$/, (m) => `Files will be saved to the folder “${m[1]}”.${tr(m[2])}`],
  [/^Dossier « (.+) » choisi$/, (m) => `Folder “${m[1]}” chosen`],
  [/^: « (.+) »$/, (m) => `: “${m[1]}”`],
  [/^Supprimer « (.+) » \? Cette action est définitive\.$/, (m) => `Delete “${m[1]}”? This cannot be undone.`],
  [/^Supprimer cette (vidéo|capture) \? Cette action est définitive\.$/, (m) => `Delete this ${m[1] === 'vidéo' ? 'video' : 'capture'}? This cannot be undone.`],
  [/^Enregistrer les (\d+) éléments sur l'ordinateur .*\?$/, (m) => `Save the ${m[1]} items to your computer (save folder set in Settings)?`],
  [/^Connecté ✓ (\d+) élément\(s\) partagé\(s\) sur ce serveur\.$/, (m) => `Connected ✓ ${m[1]} item(s) shared on this server.`],
  [/^Capture impossible : (.+)$/, (m) => `Capture failed: ${m[1]}`],
  [/^Vidéo : (.+)$/, (m) => `Video: ${m[1]}`],
  [/^Échec : (.+)$/, (m) => `Failed: ${m[1]}`],
  [/^Transcription impossible : (.+)$/, (m) => `Transcription failed: ${m[1]}`],
  [/^Enregistrement impossible : (.+)$/, (m) => `Save failed: ${m[1]}`],
  [/^Réglage non enregistré : (.+)$/, (m) => `Setting not saved: ${m[1]}`],
  [/^Commentaire non envoyé : (.+)$/, (m) => `Comment not sent: ${m[1]}`],
  [/^Impossible de démarrer : (.+)$/, (m) => `Cannot start: ${m[1]}`],
  [/^(.+)\. Vérifiez que le lien est complet\.$/, (m) => `${m[1].replace('clé incorrecte ou fichier modifié', 'wrong key or modified file')}. Check that the link is complete.`],
  [/^Serveur privé \((.+)\) : accessible uniquement depuis vos appareils connectés à Tailscale\.$/, (m) => `Private server (${m[1]}): only reachable from your devices on Tailscale.`],
  [/^Serveur (.+) : les liens de partage sont ouverts à toute personne qui les reçoit\. La galerie reste protégée par la clé\.$/, (m) => `Server ${m[1]}: share links open for anyone who receives them. The gallery stays protected by the key.`],
  [/^« (.+) » refusé : (.+)$/, (m) => `“${m[1]}” refused: ${m[2]}`],
  [/^Envoi de « (.+) »…$/, (m) => `Uploading “${m[1]}”…`],
  [/^(.+) · chiffré de bout en bout · (.+)$/, (m) => `${m[1]} · end-to-end encrypted · ${m[2]}`],
  [/^(.*) · expire le (.+)$/, (m) => `${m[1]} · expires ${m[2]}`],
  [/^Ajouter (\d+) fichiers? reçus? à LocalShot \?\n\n([\s\S]*)$/, (m) => `Add ${m[1]} received file${m[1] > 1 ? 's' : ''} to LocalShot?\n\n${m[2]}`],
  [/^Lecture du dossier… (\d+)\/(\d+)$/, (m) => `Reading folder… ${m[1]}/${m[2]}`],
  [/^(\d+) éléments? restaurés?(?: \((\d+) déjà présents?\))?$/, (m) => `${m[1]} item${m[1] > 1 ? 's' : ''} restored${m[2] ? ` (${m[2]} already there)` : ''}`],
  [/^Segment : (.+)$/, (m) => `Segment: ${m[1]}`],
  [/^Vidéo (\d+:\d+)$/, (m) => `Video ${m[1]}`],
  [/^Vidéo du (.+)$/, (m) => `Video of ${m[1]}`],
  [/^(\d+) vues?$/, (m) => `${m[1]} view${m[1] > 1 ? 's' : ''}`],
  [/^ vues?$/, (m) => (m[0].endsWith('s') ? ' views' : ' view')],
  [/^Jusqu'au (.+)$/, (m) => `Until ${m[1]}`],
  [/^Expiré le (.+)$/, (m) => `Expired on ${m[1]}`],
  [/^à (\d+:\d+)$/, (m) => `at ${m[1]}`],
  [/^Capture d'écran enregistrée dans la galerie \((.+)\)$/, (m) => `Screenshot saved to the gallery (${m[1]})`],
  [/^(Tablette|Mobile) : choisissez l'onglet « (.*) » dans « Onglet Chrome »\.$/, (m) => `${m[1] === 'Mobile' ? 'Mobile' : 'Tablet'}: choose the “${m[2]}” tab under “Chrome Tab”.`],
  [/^(Ordinateur|Tablette|Mobile) : (\d+) × (\d+)$/, (m) => `${{ Ordinateur: 'Desktop', Tablette: 'Tablet', Mobile: 'Mobile' }[m[1]]}: ${m[2]} × ${m[3]}`],
  [/^(.*) · partagée$/, (m) => `${m[1]} · shared`],
  [/^Impossible d'arrêter le partage : (.+)\. Le lien fonctionne peut-être encore ; réessayez\.$/, (m) => `Could not stop sharing: ${m[1]}. The link may still work; try again.`],
  [/^Le lien partagé n'a pas pu être supprimé \((.+)\) : il fonctionne peut-être encore\.\n\nSupprimer quand même la copie locale \?$/, (m) => `The shared link could not be deleted (${m[1]}): it may still work.\n\nDelete the local copy anyway?`],
  [/^Serveur (.+) injoignable : est-il allumé, et Tailscale connecté sur cet ordinateur \?$/, (m) => `Server ${m[1]} unreachable: is it on, and is Tailscale connected on this computer?`],
  [/^Le son de cette vidéo \(pas l'image\) va être envoyé à (.+) pour être transcrit\. Continuer \?$/, (m) => `This video's audio (not the picture) will be sent to ${m[1].replace('votre serveur', 'your server')} for transcription. Continue?`],
  [/^Chrome demande de réautoriser l'accès au dossier « (.+) » pour y enregistrer cette (vidéo|capture)\.$/, (m) => `Chrome asks you to allow access to the folder “${m[1]}” again to save this ${m[2] === 'vidéo' ? 'video' : 'capture'}.`],
  [/^Le son des vidéos que vous transcrivez sera envoyé à (.+), selon ses conditions d'utilisation\.$/, (m) => `The audio of videos you transcribe will be sent to ${m[1]}, under its terms of use.`],
  [/^Choisissez d'abord le service de transcription .*\?$/, () => 'First choose the transcription service (Whisper on your server, Mistral, OpenAI or Groq). Open settings?'],
  [/^Exemple : « (.+) » sur votre Mac ou votre serveur, puis (.+)\.$/, (m) => `Example: “${m[1]}” on your Mac or server, then ${m[2]}.`],
];

export function tr(text) {
  if (!EN || !text) return text;
  const lead = text.match(/^\s*/)[0], trail = text.match(/\s*$/)[0];
  const core = text.trim().replace(/\s+/g, ' ');
  if (!core) return text;
  if (Object.hasOwn(DICT, core)) return lead + DICT[core] + trail;
  for (const [re, fn] of PATTERNS) { const m = core.match(re); if (m) return lead + fn(m) + trail; }
  return text;
}

const ATTRS = ['placeholder', 'title', 'aria-label'];
function translateTree(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    const p = node.parentNode;
    if (p && !['SCRIPT', 'STYLE', 'TEXTAREA'].includes(p.nodeName) && !p.isContentEditable) {
      const t = tr(node.nodeValue);
      if (t !== node.nodeValue) node.nodeValue = t;
    }
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  for (const a of ATTRS) if (node.hasAttribute(a)) { const v = node.getAttribute(a); const t = tr(v); if (t !== v) node.setAttribute(a, t); }
  if (node.nodeName === 'INPUT' && ['button', 'submit'].includes(node.type) && node.value) node.value = tr(node.value);
  for (const ch of node.childNodes) translateTree(ch);
}

if (EN && typeof document !== 'undefined') {
  document.documentElement.lang = 'en';
  const run = () => { translateTree(document.documentElement); document.title = tr(document.title); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
  else run();
  new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'characterData') translateTree(m.target);
      else if (m.type === 'attributes') translateTree(m.target);
      else m.addedNodes.forEach(translateTree);
    }
  }).observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  const { confirm: c0, alert: a0 } = window;
  window.confirm = (msg) => c0.call(window, tr(String(msg)));
  window.alert = (msg) => a0.call(window, tr(String(msg)));
}
