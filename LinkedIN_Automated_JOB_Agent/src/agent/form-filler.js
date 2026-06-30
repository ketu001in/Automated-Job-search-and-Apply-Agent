/**
 * form-filler.js — Intelligent form field answering engine.
 * Uses profile data + CV skills to answer ANY LinkedIn Easy Apply question.
 * Zero API cost — fully local, rule-based with CV-aware logic.
 */

let _profile      = null;
let _questionBank = [];   // loaded from store at start of each run
let _sessionLog   = [];   // records every Q&A this run for self-learning

function setProfile(profile) { _profile = profile; }
function getProfile()        { return _profile; }

// ── Question bank (self-learning) ─────────────────────────────────────────────

function loadQuestionBank(bank) {
  _questionBank = Array.isArray(bank) ? bank : [];
  _sessionLog   = [];
}

function getSessionLog() { return _sessionLog; }

// Common words that appear in almost every form question ("What is your
// current ___?") — excluding them from similarity scoring prevents two
// UNRELATED questions (e.g. "current CTC" vs "current location") from being
// judged similar just because they share the generic preamble.
const STOP_WORDS = new Set([
  'what','is','your','the','are','you','please','this','that','have','has',
  'will','would','could','with','from','about','any','can','did','does',
  'they','them','these','those','here','there','when','where','which','who'
]);

// Look up a previously answered question (exact first, then keyword-similar).
// CRITICAL: only called as a FALLBACK after the rule-based localAnswer() has
// already failed to match — see getFormAnswer() below. A fuzzy match must
// never be allowed to override a known, profile-derived answer.
function lookupBank(q) {
  if (!_questionBank.length) return null;

  // Exact match
  const exact = _questionBank.find(b => b.question === q);
  if (exact) return exact.answer;

  // Keyword-similarity match — stricter than before: stop words excluded,
  // threshold raised to 85%, and at least 2 meaningful shared words required
  // (a single shared word like "current" was previously enough to false-match).
  const qWords = new Set(q.split(/\W+/).filter(w => w.length > 3 && !STOP_WORDS.has(w)));
  if (qWords.size < 2) return null;

  let best = null, bestScore = 0;
  for (const entry of _questionBank) {
    const eWords = new Set(entry.question.split(/\W+/).filter(w => w.length > 3 && !STOP_WORDS.has(w)));
    if (eWords.size < 2) continue;
    let overlap = 0;
    qWords.forEach(w => { if (eWords.has(w)) overlap++; });
    const score = overlap / Math.max(qWords.size, eWords.size, 1);
    if (score >= 0.85 && overlap >= 2 && score > bestScore) { best = entry; bestScore = score; }
  }
  return best ? best.answer : null;
}

// Record this run's Q&A for saving to the bank on success
function logAnswer(question, answer) {
  if (question && answer !== null && answer !== undefined && String(answer).trim()) {
    _sessionLog.push({ question: question.toLowerCase().trim(), answer: String(answer) });
  }
}

// ── Main entry point ─────────────────────────────────────────────────────────

function getFormAnswer(question, fieldType, options = []) {
  const p = _profile;
  if (!p) return defaultAnswer(fieldType, options);

  const q = (question || '').toLowerCase().trim();

  // ── Rule-based answer FIRST ─────────────────────────────────────────────
  // CRITICAL: this must run before the self-learning bank. localAnswer()
  // derives answers directly from the user's own saved profile data (CTC,
  // address, notice period, etc.) — it is always more reliable than a fuzzy
  // guess. Previously the bank ran first, and its similarity matching could
  // mistakenly hand the answer to "Current CTC" to a "Current Location"
  // question (both share generic words like "current", "what", "your").
  // Checking known rules first means a reliable answer can never be
  // overridden by a fuzzy match.
  const ans = localAnswer(question, fieldType, options, p);
  if (ans !== null && ans !== undefined) {
    logAnswer(q, ans);
    return ans;
  }

  // ── Self-learning fallback: only for questions with NO matching rule ────
  // This is the bank's actual intended purpose — answering genuinely novel
  // questions the rule engine doesn't recognize, not second-guessing known ones.
  if (fieldType !== 'radio' && fieldType !== 'checkbox' && !options.length) {
    const banked = lookupBank(q);
    if (banked !== null) {
      logAnswer(q, banked);
      return banked;
    }
  }

  const result = defaultAnswer(fieldType, options);
  logAnswer(q, result);
  return result;
}

// ── Core rule engine ─────────────────────────────────────────────────────────

function localAnswer(question, fieldType, options, p) {
  const q = (question || '').toLowerCase().trim();

  const pref   = p.preferences || {};
  const pers   = p.personal    || {};
  const addr   = p.address     || {};
  const skills = (p.cv?.skills || []).map(s => s.toLowerCase());
  const cvText = (p.cv?.rawText || '').toLowerCase();

  const expYears  = pref.experienceYears  || 0;
  const expMonths = pref.experienceMonths || 0;

  // ── Personal info ───────────────────────────────────────────────────────
  if (matchesAny(q, ['first name']))                     return pers.firstName;
  if (matchesAny(q, ['last name', 'surname']))           return pers.lastName;
  if (matchesAny(q, ['full name', 'your name']) && !q.includes('company')) return `${pers.firstName} ${pers.lastName}`.trim();
  if (q.includes('email') && !q.includes('company'))    return pers.email;
  // Phone country code MUST be checked before general 'phone' — otherwise
  // "Phone country code" matches 'phone' and returns the phone number digits instead of a country option.
  if (matchesAny(q, ['phone country code', 'phone country', 'country code', 'calling code', 'dial code', 'phone extension', 'mobile country', 'isd code'])) {
    const preferred = pers.phoneCountryCode || 'India (+91)';
    return pickCountry(options, preferred);
  }
  if (matchesAny(q, ['phone', 'mobile', 'contact number', 'tel'])) return pers.phone;
  if (matchesAny(q, ['linkedin', 'linkedin url', 'linkedin profile'])) return pers.linkedinUrl || `https://linkedin.com/in/${(pers.firstName||'').toLowerCase()}`;
  if (matchesAny(q, ['portfolio', 'website', 'personal url', 'github', 'social url', 'online profile'])) return pers.portfolioUrl || pers.linkedinUrl;

  // ── Address ─────────────────────────────────────────────────────────────
  if (matchesAny(q, ['address line 1', 'street address', 'street line 1'])) return addr.line1;
  if (matchesAny(q, ['address line 2', 'street line 2', 'apt', 'suite']))   return addr.line2;
  if (matchesAny(q, ['city', 'current city', 'current location', 'location (city)', 'city of residence', 'current city/town', 'hometown', 'preferred city', 'which city'])) return addr.city;
  if (matchesAny(q, ['state', 'province', 'county']))                        return addr.state;
  if (matchesAny(q, ['country']))                                            return pickCountry(options, addr.country || 'India');
  if (matchesAny(q, ['pincode', 'zip', 'postal code']))                      return addr.pincode;
  // Full address as single field
  if (matchesAny(q, ['full address', 'mailing address', 'residential address'])) {
    return [addr.line1, addr.line2, addr.city, addr.state, addr.country, addr.pincode].filter(Boolean).join(', ');
  }
  // "Are you based in X city?"
  for (const loc of (pref.locations || [])) {
    if (q.includes(loc.toLowerCase())) return pickYesNo(options, true);
  }
  if (q.includes(addr.city.toLowerCase()))  return pickYesNo(options, true);
  if (q.includes('bangalore') || q.includes('bengaluru')) return pickYesNo(options, addr.city.toLowerCase().includes('bangalore') || addr.city.toLowerCase().includes('bengaluru'));

  // ── Experience — domain-specific FIRST ───────────────────────────────────
  const yearsAnswer = smartYearsAnswer(q, expYears, expMonths, skills, cvText);
  if (yearsAnswer !== null) return yearsAnswer;

  // ── Current role ─────────────────────────────────────────────────────────
  const currentJob = (p.experience || []).find(e => e.isCurrent);
  if (matchesAny(q, ['current title', 'current designation', 'current position', 'current role'])) return currentJob?.title || '';
  if (matchesAny(q, ['current company', 'current employer', 'current organisation', 'current organization'])) return currentJob?.company || '';

  // ── Compensation ─────────────────────────────────────────────────────────
  // Current compensation — broad matcher (Present compensation = Current CTC)
  if (matchesAny(q, ['current ctc', 'current salary', 'present ctc', 'current package', 'last drawn', 'last salary',
                      'present salary', 'present compensation', 'current compensation', 'current remuneration',
                      'existing salary', 'existing ctc', 'annual ctc', 'fixed ctc', 'total ctc'])) {
    // Use ONLY profile values — no hardcoded fallbacks. If user hasn't set CTC, return null so field stays empty.
    const val = pref.currentCTC || pref.expectedCTC;
    if (!val) return null;
    return ctcValue(val, pref.ctcUnit || 'LPA', q);
  }
  if (matchesAny(q, ['expected ctc', 'expected salary', 'expected package', 'desired salary', 'desired compensation',
                      'expected compensation', 'expected remuneration', 'asking salary', 'salary expectation'])) {
    const val = pref.expectedCTC || pref.currentCTC;
    if (!val) return null;
    return ctcValue(val, pref.ctcUnit || 'LPA', q);
  }

  // ── Education ────────────────────────────────────────────────────────────
  const edu = (p.education || [])[0] || {};
  if (matchesAny(q, ['highest qualification', 'education', 'degree', 'highest education'])) return pickFromOptions(options, ['bachelor', 'b.e', 'b.tech', 'b.sc', 'graduate']) || edu.degree || "Bachelor's Degree";
  if (matchesAny(q, ['university', 'college', 'institution']))  return edu.institution || '';
  if (matchesAny(q, ['graduation year', 'passing year']))       return edu.endYear || '';
  if (matchesAny(q, ['gpa', 'cgpa']))                           return edu.gradeType === 'cgpa' ? edu.grade : '';
  if (matchesAny(q, ['percentage', '%', 'marks']))              return edu.gradeType === 'percentage' ? edu.grade : '';

  // ── Notice period ────────────────────────────────────────────────────────
  if (matchesAny(q, ['notice period', 'notice', 'serving notice'])) {
    const val  = pref.noticePeriodValue;  // no fallback — must come from profile
    if (!val && val !== 0) return null;   // not set → leave empty
    const unit = pref.noticePeriodUnit  || 'days';
    if (options.length) return pickClosestNotice(options, val, unit);
    // Numeric field — return ONLY the number, no unit label
    if (q.includes('day'))   return unit === 'months' ? String(val * 30) : String(val);
    if (q.includes('month')) return unit === 'days'   ? String(Math.round(val / 30)) : String(val);
    return String(val);
  }
  if (matchesAny(q, ['negotiable', 'is notice negotiable'])) return pickYesNo(options, pref.noticePeriodNegotiable || false);
  if (matchesAny(q, ['how soon', 'when can you join', 'joining availability', 'when can you start', 'available from', 'earliest start'])) return pref.joiningAvailability || `${pref.noticePeriodValue || 0} ${pref.noticePeriodUnit || 'days'}`;

  // ── Travel ───────────────────────────────────────────────────────────────
  if (matchesAny(q, ['willing to travel', 'travel required', 'okay with travel', 'comfortable travelling'])) return pickYesNo(options, pref.willingToTravel || false);
  if (matchesAny(q, ['travel percentage', '% travel', 'how much travel', 'percentage of travel'])) {
    const pct = pref.travelPercentage || 25;
    if (options.length) return pickClosestPercent(options, pct);
    return `${pct}%`;
  }

  // ── Location / relocation ────────────────────────────────────────────────
  if (matchesAny(q, ['remote', 'work from home', 'wfh']))  return pickYesNo(options, (pref.locations || []).some(l => /remote/i.test(l)));
  if (matchesAny(q, ['hybrid']))                             return pickYesNo(options, true);
  if (matchesAny(q, ['relocat']))                            return pickYesNo(options, true);
  if (matchesAny(q, ['onsite', 'on-site', 'work from office', 'wfo'])) return pickYesNo(options, true);

  // ── Work authorisation ────────────────────────────────────────────────────
  if (matchesAny(q, ['work authoriz', 'authorised to work', 'eligible to work', 'right to work', 'visa', 'work permit'])) return pickYesNo(options, true);
  if (matchesAny(q, ['require sponsorship', 'need sponsorship', 'visa sponsorship'])) return pickYesNo(options, false);
  if (matchesAny(q, ['indian citizen', 'nationality', 'citizen of india'])) return pickYesNo(options, true);
  if (matchesAny(q, ['previously worked', 'worked here before', 'past employee', 'former employee'])) return pickYesNo(options, false);

  // ── Shifts ────────────────────────────────────────────────────────────────
  if (matchesAny(q, ['us shift', 'us hours', 'night shift', 'graveyard', 'est hours', 'pst hours'])) return pickYesNo(options, false);
  if (matchesAny(q, ['uk shift', 'uk hours', 'gmt hours'])) return pickYesNo(options, false);
  if (matchesAny(q, ['flexible shift', 'flexible hours', 'flexible timing', 'flexible schedule'])) return pickYesNo(options, true);
  if (matchesAny(q, ['ist', 'india time', 'indian standard time'])) return pickYesNo(options, true);

  // ── Skills (CV-aware) ─────────────────────────────────────────────────────
  const cvSkillAnswer = cvSkillCheck(q, options, skills, cvText);
  if (cvSkillAnswer !== null) return cvSkillAnswer;

  // ── Communication / soft skills ───────────────────────────────────────────
  if (matchesAny(q, ['communication', 'interpersonal', 'leadership']))   return pickYesNo(options, true);
  if (matchesAny(q, ['team management', 'people management', 'manage team'])) return pickYesNo(options, true);
  if (matchesAny(q, ['stakeholder management', 'stakeholder']))          return pickYesNo(options, true);
  if (matchesAny(q, ['risk management', 'risk']))                        return pickYesNo(options, true);
  if (matchesAny(q, ['budget', 'p&l', 'financial management']))          return pickYesNo(options, true);
  if (matchesAny(q, ['vendor management']))                              return pickYesNo(options, true);

  // ── Consent / Confirm / Agree — ALWAYS YES ────────────────────────────────
  // Any checkbox or radio asking for consent, agreement, or confirmation
  // must always be accepted to allow the application to proceed.
  if (matchesAny(q, [
    'i agree', 'i consent', 'i confirm', 'i acknowledge', 'i certify', 'i accept',
    'i understand', 'i hereby', 'i declare', 'i authorise', 'i authorize',
    'agree to', 'consent to', 'confirm that', 'certify that',
    'terms and conditions', 'terms of service', 'privacy policy',
    'data protection', 'gdpr', 'equal opportunity', 'eeo',
    'information is accurate', 'information is correct', 'is true and correct',
    'to the best of my knowledge', 'accurate and complete',
    'accept the terms', 'read and understood', 'aware that',
    'non-disclosure', 'background screening consent'
  ])) return pickYesNo(options, true);

  // ── Interview / process ───────────────────────────────────────────────────
  if (matchesAny(q, ['virtual interview', 'video interview', 'online interview'])) return pickYesNo(options, true);
  if (matchesAny(q, ['background check', 'bgv', 'background verification'])) return pickYesNo(options, true);
  if (matchesAny(q, ['drug test'])) return pickYesNo(options, true);

  // ── Language ──────────────────────────────────────────────────────────────
  if (matchesAny(q, ['english', 'english proficiency'])) return options.length ? pickFromOptions(options, ['native', 'bilingual', 'full professional', 'professional working']) || options[0] : 'Native or bilingual proficiency';
  if (matchesAny(q, ['hindi'])) return pickYesNo(options, true);

  // ── Cover letter / descriptive ────────────────────────────────────────────
  if (matchesAny(q, ['cover letter', 'why do you want', 'why are you interested', 'why this role'])) {
    const roles = (pref.targetRoles || []).join(' and ') || 'this role';
    return `I am an experienced professional with ${expYears}+ years of experience in ${roles}. My background, skills, and accomplishments align strongly with this opportunity, and I am excited to contribute my expertise to your organization.`;
  }
  if (matchesAny(q, ['describe yourself', 'tell us about yourself', 'brief introduction'])) {
    return `${expYears}+ years experienced professional${pref.targetRoles?.length ? ` specializing in ${pref.targetRoles[0]}` : ''}. Skilled in ${skills.slice(0, 5).join(', ')||'program management and delivery'}.`;
  }

  // ── Disability / EEO ─────────────────────────────────────────────────────
  if (matchesAny(q, ['disability', 'differently abled', 'person with disability'])) return pickFromOptions(options, ['no', 'not', 'do not', 'prefer not']) || pickYesNo(options, false);
  if (matchesAny(q, ['veteran', 'military service'])) return pickYesNo(options, false);
  if (matchesAny(q, ['gender'])) return pickFromOptions(options, ['male', 'man', 'prefer not']) || (options[0] || 'Male');

  return null;
}

// ── CV-Aware skill check ──────────────────────────────────────────────────────
// If the question asks "how many years with X", return a number.
// If it's a yes/no question about X, return Yes/No based on CV data.

// Technology → typical years of experience to claim
const TECH_YEARS = {
  'gcp': 5, 'google cloud': 5, 'azure': 3, 'microsoft azure': 3,
  'aws': 4, 'amazon web services': 4,
  'agile': 10, 'scrum': 10, 'safe': 8, 'kanban': 6,
  'jira': 8, 'confluence': 6, 'ms project': 5, 'smartsheet': 4,
  'ci/cd': 4, 'devops': 4,
  'python': 3, 'java': 3, 'javascript': 2, 'sql': 5,
  'power bi': 3, 'tableau': 2, 'excel': 10,
  'program management': 12, 'project management': 12, 'pmo': 10,
  'stakeholder': 15, 'waterfall': 8, 'pmp': 5, 'prince2': 4
};

function cvSkillCheck(q, options, skills, cvText) {
  const isHowManyYears = matchesAny(q, ['how many years', 'years of experience', 'years of work experience', 'experience in years']);

  for (const [skill, defaultYears] of Object.entries(TECH_YEARS)) {
    if (!q.includes(skill)) continue;

    const hasSkill = skills.some(s => s.includes(skill)) || cvText.includes(skill);

    if (isHowManyYears) {
      // Return numeric years — for text/number input fields
      if (!options.length) return hasSkill ? String(defaultYears) : '0';
      // For dropdown/radio: pick the closest year option
      return pickClosestNotice(options, hasSkill ? defaultYears : 0, 'years');
    }

    // Yes/No question about the skill
    return pickYesNo(options, hasSkill);
  }

  // Generic skill keywords not in the map
  const genericSkills = ['ai', 'ml', 'machine learning', 'artificial intelligence', 'data analysis', 'six sigma'];
  for (const skill of genericSkills) {
    if (q.includes(skill)) {
      const hasSkill = skills.some(s => s.includes(skill)) || cvText.includes(skill);
      if (isHowManyYears && !options.length) return hasSkill ? '3' : '0';
      return pickYesNo(options, hasSkill);
    }
  }

  return null;
}

// ── Experience years — smart multi-format ─────────────────────────────────────

function smartYearsAnswer(q, expYears, expMonths, skills, cvText) {
  // "X years of experience in Y" — extract required years from question
  const requiresMatch = q.match(/(\d+)\+?\s*years?\s*(?:of\s*)?(?:experience|exp)/i);
  const isYearsField  = matchesAny(q, ['years of exp', 'experience (years)', 'total exp', 'total years', 'overall exp', 'how many years', 'exp in years', 'number of years']);

  if (requiresMatch && options.length) {
    // Bullet/radio: "Do you have 10+ years?" → compare with profile
    const required = parseInt(requiresMatch[1]);
    const hasEnough = expYears >= required || (expYears >= required - 2); // ±2 year threshold (Req A10-C)
    return pickYesNo(options, hasEnough);
  }

  if (!isYearsField) return null;

  // Months-only field
  if (q.includes('month') && q.includes('exp')) return String(expMonths);

  // "19.2" combined format
  if (matchesAny(q, ['total exp', 'overall exp', 'total experience', 'overall experience'])) {
    const m = String(expMonths).padStart(2, '0');
    return `${expYears}.${m}`;
  }

  // Default: return years
  return String(expYears);
}

// ── CTC format helper ─────────────────────────────────────────────────────────

function ctcValue(baseLpa, unit, q) {
  if (!baseLpa) return '';
  if (matchesAny(q, ['per month', 'monthly', '/month'])) return String(Math.round(baseLpa * 100000 / 12));
  if (matchesAny(q, ['in rupees', 'inr', 'rupees', 'per annum', 'annual salary', 'annual ctc', 'yearly'])) return String(baseLpa * 100000);
  return String(baseLpa); // default: LPA
}

// ── Notice period matching ────────────────────────────────────────────────────
// CRITICAL FIX: options like "One week", "Two months", "One and a half month"
// use WORD numbers, not digits. The old regex /(\d+)/ never matched any of
// them, so every option scored identically (diff:999) and the function
// effectively always returned options[0] regardless of the user's actual
// notice period — this is what looked like the agent "getting stuck" on
// notice-period radio questions (an unhelpful answer made LinkedIn's
// validation block progress, and the step loop kept retrying).
const WORD_NUMBERS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12
};

function parseOptionToDays(opt) {
  const lower = opt.toLowerCase().trim();
  if (/available now|immediate(ly)?|\basap\b/.test(lower)) return 0;

  let n = null;
  const digitMatch = lower.match(/(\d+(?:\.\d+)?)/);
  if (digitMatch) {
    n = parseFloat(digitMatch[1]);
  } else if (/one and a half/.test(lower)) {
    n = 1.5;
  } else {
    for (const [word, value] of Object.entries(WORD_NUMBERS)) {
      if (new RegExp(`\\b${word}\\b`).test(lower)) { n = value; break; }
    }
  }
  if (n === null) return null;

  if (/year/.test(lower))  return n * 365;
  if (/month/.test(lower)) return n * 30;
  if (/week/.test(lower))  return n * 7;
  return n; // plain days
}

function pickClosestNotice(options, val, unit) {
  const targetDays =
    unit === 'years'  ? val * 365 :
    unit === 'months' ? val * 30  :
    unit === 'weeks'  ? val * 7   : val;

  const scores = options.map(opt => {
    const d = parseOptionToDays(opt);
    if (d === null) return { opt, diff: Infinity };
    return { opt, diff: Math.abs(d - targetDays) };
  });
  scores.sort((a, b) => a.diff - b.diff);
  return scores[0]?.opt || options[0];
}

// ── Travel % matching ────────────────────────────────────────────────────────

function pickClosestPercent(options, pct) {
  const scores = options.map(opt => {
    const m = opt.match(/(\d+)/);
    return { opt, diff: m ? Math.abs(parseInt(m[1]) - pct) : 999 };
  });
  scores.sort((a, b) => a.diff - b.diff);
  return scores[0]?.opt || options[0];
}

// ── Country picker ────────────────────────────────────────────────────────────

function pickCountry(options, preferredCountry) {
  if (!options.length) return preferredCountry;
  const exact = options.find(o => o.toLowerCase() === preferredCountry.toLowerCase());
  if (exact) return exact;
  const partial = options.find(o => o.toLowerCase().includes(preferredCountry.toLowerCase()));
  return partial || preferredCountry;
}

// ── Generic helpers ───────────────────────────────────────────────────────────

function defaultAnswer(fieldType, options) {
  if (options.length > 0) return options[0];
  // Return null for number/text — let the form-filler skip unfilled fields rather than
  // inserting hardcoded junk values. The skip-on-stuck logic handles validation failures.
  return null;
}

function matchesAny(str, keywords) {
  return keywords.some(k => str.includes(k));
}

function pickYesNo(options, value) {
  if (!options.length) return value ? 'Yes' : 'No';
  const yes = options.find(o => /^yes$/i.test(o.trim()));
  const no  = options.find(o => /^no$/i.test(o.trim()));
  return value ? (yes || options[0]) : (no || options[options.length - 1]);
}

function pickFromOptions(options, keywords) {
  return options.find(o => keywords.some(k => o.toLowerCase().includes(k))) || null;
}

module.exports = { getFormAnswer, setProfile, getProfile, loadQuestionBank, getSessionLog };
