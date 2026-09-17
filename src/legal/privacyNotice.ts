// LifeTap privacy notice and responder undertaking — single source for every
// consent screen. Written from what the app actually collects. Still marked a
// draft until the team's capstone adviser has reviewed it; if an LGU adopts
// LifeTap it becomes the controller and this notice must be rewritten around
// its Data Protection Officer and retention rules.
//
// Bump PRIVACY_NOTICE_VERSION whenever the notice materially changes: users
// who accepted an older version are asked to review and accept again.

// v2: tags are now encrypted (the v1 notice said they weren't).
// v3: consent history is kept, including a record of withdrawals (sections 3 and 6).
export const PRIVACY_NOTICE_VERSION = '2026-09-v3';
export const RESPONDER_UNDERTAKING_VERSION = 'resp-2026-09-v1';

// Shows a "Draft" label on the notice until it has been reviewed.
export const NOTICE_IS_DRAFT = true;

// The team is the personal information controller for the capstone pilot —
// no LGU has adopted LifeTap yet. A team member acts as privacy lead; anything
// they can't resolve goes to the university's Data Protection Officer.
export const CONTROLLER = {
  name:
    'ArchTech, a student capstone team of the BS Information Technology program, ' +
    'Lyceum of the Philippines University – Batangas',
  dpoContact:
    'archtechbtg@gmail.com (ArchTech privacy lead). Unresolved concerns may be raised with the ' +
    'Data Protection Officer of Lyceum of the Philippines University – Batangas.',
  reportRetention:
    'kept only for the capstone pilot and deleted, together with all other pilot data, within 30 days ' +
    'after the project is defended',
};

// First layer: shown on the consent screen before anything is collected.
export const NOTICE_SUMMARY: { title: string; body: string }[] = [
  {
    title: 'What we collect',
    body:
      'Your name, phone, address, date of birth, blood type, religion (optional), organ donor status, ' +
      'allergies, conditions, medications, and your emergency contacts’ names, relationships and numbers.',
  },
  {
    title: 'Why',
    body:
      'So emergency responders can identify you and treat you safely when you can’t speak for yourself — ' +
      'and, if you allow it, tell your emergency contacts that you were found.',
  },
  {
    title: 'Where it’s kept',
    body:
      'Encrypted on this phone and on your LifeTap tag. On LifeTap Cloud (Supabase, hosted in Sydney, ' +
      'Australia) only if you turn on cloud backup.',
  },
  {
    title: 'Who can see it',
    body:
      'Authorized responders who scan your tag see your full profile. Other people using LifeTap see ' +
      'only your name and blood type unless you make your profile public. Your tag is encrypted and ' +
      'write-protected, so other NFC apps can’t read or change it.',
  },
  {
    title: 'Your choices',
    body:
      'You can view, correct, download or delete your data, see your consent history, and withdraw ' +
      'consent at any time in Settings → Privacy & Consent.',
  },
];

// Full notice, shown from "Read the full privacy notice".
export const NOTICE_SECTIONS: { heading: string; paragraphs: string[] }[] = [
  {
    heading: '1. Who is responsible for your data',
    paragraphs: [
      `LifeTap is operated by ${CONTROLLER.name}, which is the personal information controller for ` +
        'LifeTap under the Data Privacy Act of 2012 (Republic Act No. 10173).',
      'LifeTap is a student project under testing, not a government service. No local government unit ' +
        'has adopted it yet. If one does, it becomes the controller and you will be shown a new notice ' +
        'and asked to consent again.',
      `Contact: ${CONTROLLER.dpoContact}`,
    ],
  },
  {
    heading: '2. What we collect',
    paragraphs: [
      'Profile: full name, phone number, barangay and city, date of birth, blood type, religion ' +
        '(optional), and organ donor preference.',
      'Medical: allergies, medical conditions and medications.',
      'Emergency contacts: the names, relationships and phone numbers of the people you list.',
      'Account (only if you sign in): your phone number, used to send you a one-time code.',
      'Health information, age and religion are sensitive personal information under Section 3(l) of ' +
        'the Act and are handled with extra care.',
    ],
  },
  {
    heading: '3. Why we use it and our legal basis',
    paragraphs: [
      'Emergency identification and care — your consent (Section 13(a)). In an emergency where you cannot ' +
        'give consent, responders may read your tag to protect your life and health (Section 13(c)).',
      'Alerting your emergency contacts — only if you allow it. The text message contains your name, the ' +
        'place and time you were found, and the responder’s name.',
      'Cloud backup — only if you turn it on. It lets you restore your profile on a new phone and lets ' +
        'authorized personnel see your profile in the LifeTap dashboard for disaster response.',
      'Incident records — when a responder scans your tag during an incident, your name, blood type, date ' +
        'of birth, allergies, conditions, medications and emergency contacts are added to that incident ' +
        'report, which is kept as part of disaster risk reduction and management work ' +
        '(Republic Act No. 10121).',
      'Consent records — a history of when you gave, renewed, changed or withdrew consent and what ' +
        'you chose, so we can show that we asked and that we followed your choices (the Act’s ' +
        'accountability principle, Section 21). It holds no medical information. It is kept on this ' +
        'phone, and in LifeTap Cloud too if you turn on cloud backup.',
    ],
  },
  {
    heading: '4. Who can see your data',
    paragraphs: [
      'Authorized responders who scan your tag see your full profile. During this pilot, those are only the ' +
        'accounts the team activates for testing; in a deployment they would be LGU medics, barangay ' +
        'health workers and DRRMO staff.',
      'Other LifeTap users who scan your tag see only your name and blood type, unless you make your ' +
        'profile public.',
      'Your tag is encrypted. Your name, blood type and LifeTap ID can be read by anyone using the ' +
        'LifeTap app; the rest (address, contacts, medical details) can only be unlocked by authorized ' +
        'responders. Other NFC apps see only a short “LifeTap medical ID” label.',
      'If you use cloud backup, authorized personnel for your city can view your profile in the ' +
        'LifeTap dashboard. Access is logged.',
      'We do not sell your data or use it for advertising.',
    ],
  },
  {
    heading: '5. Service providers and transfers outside the Philippines',
    paragraphs: [
      'Supabase stores cloud backups and incident reports on servers in Sydney, Australia.',
      'Twilio (United States) delivers emergency-contact text messages.',
      'Both process data only on our instructions and under contractual safeguards (Section 21).',
    ],
  },
  {
    heading: '6. How long we keep it',
    paragraphs: [
      'On this phone and your tag: until you delete it or erase the tag.',
      'In the cloud: until you delete your account.',
      `Incident reports: ${CONTROLLER.reportRetention}. Deleting your account does not remove your ` +
        'information from incident reports already filed by responders.',
      'Consent history: on this phone until you delete your profile. The cloud copy — including the ' +
        'record that you withdrew consent or deleted your account (its date, the notice version and ' +
        `an account reference, not your profile) — is ${CONTROLLER.reportRetention}, so we can show ` +
        'your request was carried out.',
    ],
  },
  {
    heading: '7. How we protect it',
    paragraphs: [
      'Data on your phone is encrypted by the operating system’s secure storage. Your tag is encrypted ' +
        '(AES-256-GCM; the medical part is sealed to a responder key that only active responder accounts can ' +
        'download) and write-protected with a password unique to your tag. Cloud data is protected by ' +
        'access rules that limit each account to what it is allowed to see. Only active responder accounts ' +
        'can send alerts, and each alert is logged.',
      'No protection is absolute: someone who takes apart the LifeTap app could read the name and blood ' +
        'type part of tags. Keep your tag with you and erase it if it is lost.',
      'If a breach affects your data, we will notify you and the National Privacy Commission within 72 ' +
        'hours as required.',
    ],
  },
  {
    heading: '8. Your rights',
    paragraphs: [
      'You have the right to be informed, to access and correct your data, to object and withdraw ' +
        'consent, to have your data erased or blocked, to data portability, to claim damages, and to file a ' +
        'complaint with the National Privacy Commission (privacy.gov.ph).',
      'In the app: edit your profile any time; download a copy of your data, change or withdraw consent, ' +
        'erase your tag, and delete your account in Settings → Privacy & Consent. Withdrawing consent is ' +
        'as easy as giving it and costs nothing.',
      `For anything else, contact the Data Protection Officer: ${CONTROLLER.dpoContact}.`,
    ],
  },
  {
    heading: '9. Minors and people who cannot consent',
    paragraphs: [
      'A parent or legal guardian must give consent for anyone under 18, or for anyone who cannot give ' +
        'consent themselves.',
    ],
  },
  {
    heading: '10. Your emergency contacts',
    paragraphs: [
      'By listing someone as an emergency contact, you confirm they agreed to be listed and to be ' +
        'contacted in an emergency.',
    ],
  },
  {
    heading: '11. Changes to this notice',
    paragraphs: [
      `Version ${PRIVACY_NOTICE_VERSION}. If this notice changes in a way that affects you, the app will ` +
        'show you the new version and ask for your consent again.',
    ],
  },
];

// Shown once to each personnel account before responder mode unlocks.
export const RESPONDER_UNDERTAKING: { intro: string; points: string[]; closing: string } = {
  intro:
    'Responder mode shows sensitive personal information — health, age and religion — of the people ' +
    'whose tags you scan. Before you continue, you agree to:',
  points: [
    'Access LifeTap profiles only for emergency response and your official duties.',
    'Not copy, screenshot, photograph or share profile information outside official channels.',
    'Send SMS alerts only to a victim’s listed contacts, and only when it serves the victim.',
    'Keep your phone locked, and report a lost or stolen phone to your administrator immediately.',
  ],
  closing:
    'Access and alerts are logged. Unauthorized or negligent access to sensitive personal information ' +
    'is punishable under the Data Privacy Act (Sections 25–26) by imprisonment and fines.',
};
