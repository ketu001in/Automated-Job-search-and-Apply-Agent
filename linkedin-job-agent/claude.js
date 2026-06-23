/**
 * claude.js  (API-free version)
 *
 * No Claude API, no credits, no cost.
 * Uses rule-based keyword matching for:
 *   1. Job compatibility assessment
 *   2. Easy Apply form field answers
 */

const profile = require('./profile');

// ─── Job Compatibility Assessment (keyword-based, free) ───────────────────────

function assessJobCompatibility(jobTitle, company, jobDescription) {
  const title = (jobTitle || '').toLowerCase();
  const desc  = (jobDescription || '').toLowerCase().substring(0, 3000);

  // ── Hard exclusions ────────────────────────────────────────────────────────
  const hardSkip = [
    'marketing program', 'b2b marketing', 'sales program', 'ad operations',
    'digital marketing', 'growth marketing', 'brand program',
    'content program', 'seo program', 'social media program',
    'performance marketing', 'demand generation'
  ];
  if (matchesAny(title, hardSkip)) {
    return { compatible: false, score: 2, reason: '', skip_reason: `Marketing/Sales role: ${jobTitle}` };
  }

  // ── Strong matches (score 9) ───────────────────────────────────────────────
  const strongMatch = [
    'technical program manager', 'tpm', 'pmo', 'project management office',
    'program manager', 'programme manager', 'delivery manager',
    'senior program manager', 'principal program manager',
    'program director', 'portfolio manager', 'it program manager',
    'agile program manager', 'scrum master', 'release train engineer',
    'it delivery', 'it project manager'
  ];
  if (matchesAny(title, strongMatch)) {
    return { compatible: true, score: 9, reason: 'Title is a direct PM/PMO match', skip_reason: '' };
  }

  // ── Good matches (score 7) ─────────────────────────────────────────────────
  const goodMatch = [
    'project manager', 'delivery lead', 'engagement manager',
    'transformation manager', 'change manager', 'business program',
    'cloud program', 'digital program', 'ai program', 'ml program',
    'operations manager', 'strategy manager', 'product delivery'
  ];
  if (matchesAny(title, goodMatch)) {
    return { compatible: true, score: 7, reason: 'Related management role', skip_reason: '' };
  }

  // ── Clearly unrelated ──────────────────────────────────────────────────────
  const skipTitles = [
    'marketing', 'sales manager', 'accountant', 'finance manager', 'hr manager',
    'recruiter', 'graphic design', 'content writer', 'seo', 'social media',
    'business development', 'data entry', 'receptionist', 'customer support',
    'inside sales', 'account executive', 'copywriter'
  ];
  if (matchesAny(title, skipTitles)) {
    return { compatible: false, score: 2, reason: '', skip_reason: `Unrelated role: ${jobTitle}` };
  }

  // ── Borderline (score 5) ───────────────────────────────────────────────────
  const descMentionsPM = matchesAny(desc, [
    'program management', 'pmo', 'project management', 'delivery management',
    'agile', 'scrum', 'stakeholder management', 'cross-functional'
  ]);
  if (descMentionsPM) {
    return { compatible: true, score: 5, reason: 'Description mentions PM skills', skip_reason: '' };
  }

  return { compatible: true, score: 6, reason: 'Found via PM/PMO search — applying', skip_reason: '' };
}

// ─── Form Field Answer (fully local, no API) ──────────────────────────────────

function getFormAnswer(question, fieldType, options = []) {
  return localAnswer(question, fieldType, options) || defaultAnswer(fieldType, options);
}

// ─── Local Answer Rules ───────────────────────────────────────────────────────

function localAnswer(question, fieldType, options) {
  const q = (question || '').toLowerCase();

  // ── Personal info ──────────────────────────────────────────────────────────
  if (matchesAny(q, ['first name']))
    return profile.name.split(' ')[0];
  if (matchesAny(q, ['last name', 'surname']))
    return profile.name.split(' ').slice(1).join(' ');
  if (matchesAny(q, ['full name', 'your name']) && !q.includes('company') && !q.includes('manager'))
    return profile.name;
  if (q.includes('email') && !q.includes('company'))
    return profile.email;
  if (matchesAny(q, ['phone', 'mobile', 'contact number']))
    return profile.phone;
  if (matchesAny(q, ['linkedin', 'linkedin url', 'linkedin profile']))
    return 'https://www.linkedin.com/in/ketulshah/';
  // Social / online profile fields
  if (matchesAny(q, ['social url', 'social media url', 'social profile', 'social link',
                      'personal website', 'portfolio', 'portfolio url', 'online profile',
                      'personal url', 'personal link', 'github', 'other url', 'profile url']))
    return 'https://www.linkedin.com/in/ketulshah/';
  if (q.includes('website') && !q.includes('company') && !q.includes('employer'))
    return 'https://www.linkedin.com/in/ketulshah/';

  // ── Location ───────────────────────────────────────────────────────────────
  if (matchesAny(q, ['city', 'current city', 'current location', 'location']))
    return 'Bengaluru';
  if (matchesAny(q, ['state', 'province']))
    return 'Karnataka';
  if (matchesAny(q, ['country']))
    return 'India';
  if (matchesAny(q, ['pincode', 'zip', 'postal']))
    return '560001';
  if (matchesAny(q, ['bangalore', 'bengaluru', 'based in', 'currently based']))
    return pickYesNo(options, true);

  // ── Experience ─────────────────────────────────────────────────────────────
  // Domain-specific experience — check FIRST before generic total-years rules
  // so "years of experience in program management" → 12, not 19
  if (matchesAny(q, ['program management', 'programme management', 'project management',
                      'pm experience', 'pmo experience', 'program manager',
                      'project manager', 'delivery management', 'delivery manager']))
    return '12';
  if (matchesAny(q, ['agile exp', 'agile experience', 'scrum experience', 'safe experience']))
    return '10';
  if (matchesAny(q, ['cloud exp', 'cloud experience', 'gcp experience', 'azure experience', 'aws experience']))
    return '5';

  // Generic total/years fields — only after domain checks above
  // Months-only field
  if (q.includes('month') && matchesAny(q, ['exp', 'experience']))
    return String(profile.experienceMonths);
  // Years-only field (no domain context)
  if (matchesAny(q, ['years of exp', 'experience (years)', 'experience in years', 'how many years', 'exp in years']))
    return String(profile.yearsOfExperience);
  // Combined total — "19.10" = 19 years 10 months
  if (matchesAny(q, ['total exp', 'total years', 'total experience', 'overall exp', 'overall experience'])) {
    const months = String(profile.experienceMonths).padStart(2, '0');
    return profile.yearsOfExperience + '.' + months;
  }
  if (matchesAny(q, ['relevant exp', 'relevant experience']))
    return String(Math.min(profile.yearsOfExperience, 15));
  // Previously worked here? Always No
  if (matchesAny(q, ['previously worked', 'worked here before', 'worked at this company',
                      'previously employed', 'former employee', 'worked for this company',
                      'previously associated', 'past employee']))
    return pickYesNo(options, false);
  if (matchesAny(q, ['current title', 'current designation', 'current role']))
    return profile.currentTitle;
  if (matchesAny(q, ['current company', 'current employer', 'current organisation']))
    return profile.currentCompany;
  if (matchesAny(q, ['highest qualification', 'education', 'degree']))
    return pickFromOptions(options, ['bachelor', 'b.e', 'b.tech', 'graduate']) || "Bachelor's Degree";

  // ── Compensation — smart format detection ─────────────────────────────────
  // Detects LPA (39), annual rupees (3900000), or monthly (325000) from label
  function ctcValue(baseLpa) {
    if (matchesAny(q, ['per month', 'monthly', '/month', 'per month (inr)']))
      return String(Math.round(baseLpa * 100000 / 12));
    if (matchesAny(q, ['in rupees', 'inr', 'rupees', 'per annum', 'annual salary',
                        'annual ctc', 'yearly salary', 'annual package', 'annual compensation']))
      return String(baseLpa * 100000);
    return String(baseLpa); // default: LPA
  }
  if (matchesAny(q, ['current ctc', 'current salary', 'present ctc', 'current package',
                      'current compensation', 'last drawn', 'last salary']))
    return ctcValue(profile.currentCTC);
  if (matchesAny(q, ['expected ctc', 'expected salary', 'expected package', 'desired salary',
                      'expected compensation', 'desired compensation', 'desired package']))
    return ctcValue(profile.expectedCTC);

  // ── Notice / Availability ──────────────────────────────────────────────────
  if (matchesAny(q, ['notice period', 'notice', 'how soon can you join', 'joining period']))
    return String(profile.noticePeriod);
  if (matchesAny(q, ['availability', 'when can you join', 'when can you start', 'available from', 'joining availability'])) {
    if (options && options.length) {
      const pick = pickFromOptions(options, ['immediately', 'immediate', '7 days', '1 week', '15 days',
                                             '2 weeks', '1 month', 'within a week', '< 15', 'less than 15', '0-15']);
      if (pick) return pick;
      return options[0];
    }
    return String(profile.noticePeriod) + ' days';
  }

  // ── Work authorisation ─────────────────────────────────────────────────────
  if (matchesAny(q, ['work authoriz', 'authorised to work', 'eligible to work', 'right to work', 'visa', 'work permit']))
    return pickYesNo(options, true);
  if (matchesAny(q, ['require sponsorship', 'need sponsorship', 'visa sponsorship']))
    return pickYesNo(options, false);
  if (matchesAny(q, ['indian citizen', 'nationality']))
    return pickYesNo(options, true);

  // ── Work mode ──────────────────────────────────────────────────────────────
  if (matchesAny(q, ['remote', 'work from home', 'wfh']))
    return pickYesNo(options, profile.openToRemote);
  if (matchesAny(q, ['hybrid']))
    return pickYesNo(options, profile.openToHybrid);
  if (matchesAny(q, ['relocat']))
    return pickYesNo(options, profile.willingToRelocate);
  if (matchesAny(q, ['onsite', 'on-site', 'work from office', 'wfo']))
    return pickYesNo(options, profile.openToOnsite);

  // ── Shifts ─────────────────────────────────────────────────────────────────
  if (matchesAny(q, ['us shift', 'us hours', 'us time zone', 'night shift', 'graveyard']))
    return pickYesNo(options, false);
  if (matchesAny(q, ['uk shift', 'uk hours']))
    return pickYesNo(options, false);
  if (matchesAny(q, ['flexible shift', 'flexible hours', 'flexible timing']))
    return pickYesNo(options, true);

  // ── Skills / Tools ─────────────────────────────────────────────────────────
  if (matchesAny(q, ['agile', 'scrum', 'safe', 'scaled agile']))
    return pickYesNo(options, true);
  if (matchesAny(q, ['waterfall', 'pmp', 'prince2']))
    return pickYesNo(options, true);
  if (matchesAny(q, ['jira', 'confluence', 'atlassian']))
    return pickYesNo(options, true);
  if (matchesAny(q, ['ms project', 'microsoft project']))
    return pickYesNo(options, true);
  if (matchesAny(q, ['smartsheet']))
    return pickYesNo(options, true);
  if (matchesAny(q, ['project management tool', 'pm tool', 'project tracking']))
    return pickYesNo(options, true);
  if (matchesAny(q, ['cloud', 'gcp', 'google cloud']))
    return pickYesNo(options, true);
  if (matchesAny(q, ['aws', 'amazon web services']))
    return pickYesNo(options, true);
  if (matchesAny(q, ['azure', 'microsoft azure']))
    return pickYesNo(options, true);
  if (matchesAny(q, ['ci/cd', 'devops', 'pipeline']))
    return pickYesNo(options, true);
  if (matchesAny(q, ['ai', 'ml', 'machine learning', 'artificial intelligence']))
    return pickYesNo(options, true);
  if (matchesAny(q, ['stakeholder management', 'stakeholder']))
    return pickYesNo(options, true);
  if (matchesAny(q, ['risk management', 'risk']))
    return pickYesNo(options, true);
  if (matchesAny(q, ['budget', 'p&l', 'financial']))
    return pickYesNo(options, true);
  if (matchesAny(q, ['vendor management', 'vendor']))
    return pickYesNo(options, true);

  // ── Interview / Process ────────────────────────────────────────────────────
  if (matchesAny(q, ['virtual interview', 'video interview', 'online interview']))
    return pickYesNo(options, true);
  if (matchesAny(q, ['background check', 'bgv', 'background verification']))
    return pickYesNo(options, true);
  if (matchesAny(q, ['drug test']))
    return pickYesNo(options, true);

  // ── Language ───────────────────────────────────────────────────────────────
  if (matchesAny(q, ['english', 'english proficiency', 'language proficiency'])) {
    if (options.length > 0) {
      return pickFromOptions(options, ['native', 'bilingual', 'full professional', 'professional working']) || options[0];
    }
    return 'Native or bilingual proficiency';
  }
  if (matchesAny(q, ['hindi']))
    return pickYesNo(options, true);

  // ── Communication / soft skills ────────────────────────────────────────────
  if (matchesAny(q, ['communication skill', 'interpersonal', 'leadership skill']))
    return pickYesNo(options, true);
  if (matchesAny(q, ['team management', 'people management', 'manage team']))
    return pickYesNo(options, true);

  // ── Cover letter / summary ─────────────────────────────────────────────────
  if (matchesAny(q, ['cover letter', 'why do you want', 'why are you interested', 'why this role', 'why us', 'why join'])) {
    return `I am a Senior Technical Program Manager with ${profile.yearsOfExperience}+ years of experience in AI/ML, cloud migration, and PMO governance. My background at ${profile.currentCompany} aligns strongly with this role, and I am excited about the opportunity to contribute my expertise in program delivery and stakeholder management.`;
  }
  if (matchesAny(q, ['describe yourself', 'tell us about yourself', 'brief introduction'])) {
    return `${profile.yearsOfExperience}+ years experienced Senior Technical Program Manager specializing in AI/ML, GCP cloud migration, digital transformation, and PMO governance. Currently leading large-scale programs at ${profile.currentCompany}.`;
  }
  if (matchesAny(q, ['achievement', 'accomplishment', 'key contribution'])) {
    return 'Led end-to-end GCP cloud migration and AI/ML anomaly detection program at Equifax ensuring RBI compliance, delivered on time and within budget managing cross-functional teams across multiple geographies.';
  }

  // ── Salary format variants ─────────────────────────────────────────────────
  if (matchesAny(q, ['salary expectation', 'compensation expectation', 'package expectation']))
    return `${profile.expectedCTC} LPA`;
  if (matchesAny(q, ['annual salary', 'annual ctc']))
    return String(profile.expectedCTC);

  // ── Disability / EEO ──────────────────────────────────────────────────────
  if (matchesAny(q, ['disability', 'differently abled', 'person with disability']))
    return pickFromOptions(options, ['no', 'not', 'do not']) || pickYesNo(options, false);
  if (matchesAny(q, ['veteran', 'military service']))
    return pickYesNo(options, false);
  if (matchesAny(q, ['gender'])) {
    return pickFromOptions(options, ['male', 'man', 'prefer not']) || (options[0] || 'Male');
  }

  return null; // Unknown field
}

// ─── Default Fallback ─────────────────────────────────────────────────────────

function defaultAnswer(fieldType, options) {
  if (options.length > 0) return options[0];
  if (fieldType === 'number') return '1';
  return '';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function matchesAny(str, keywords) {
  return keywords.some(k => str.includes(k));
}

function pickYesNo(options, value) {
  if (options.length === 0) return value ? 'Yes' : 'No';
  const yes = options.find(o => /^yes$/i.test(o.trim()));
  const no  = options.find(o => /^no$/i.test(o.trim()));
  if (value) return yes || options[0];
  return no || options[options.length - 1];
}

function pickFromOptions(options, keywords) {
  return options.find(o => keywords.some(k => o.toLowerCase().includes(k))) || null;
}

module.exports = { assessJobCompatibility, getFormAnswer };
