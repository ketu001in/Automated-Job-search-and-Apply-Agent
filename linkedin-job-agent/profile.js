/**
 * Your profile data — pre-filled from your CV.
 * Update any fields here as needed.
 */
module.exports = {
  // Personal
  name: 'Ketul Shah',
  email: 'ketu001in@gmail.com',
  phone: '8884166688',
  phoneCountryCode: 'India (+91)',
  location: 'Bengaluru, Karnataka, India',

  // Professional
  currentTitle: 'Senior Technical Program Manager',
  currentCompany: 'Equifax (Credit Information Systems Ltd)',
  yearsOfExperience: 19,
  experienceMonths: 10,   // for forms that ask months separately

  // Compensation (in LPA unless otherwise noted)
  currentCTC: 39,
  expectedCTC: 45,
  noticePeriod: 7, // days

  // Job search settings
  searchQueries: [
    'Senior Program Manager',
    'Program Manager',
    'PMO'
  ],
  location: 'Bengaluru, Karnataka, India',
  minCompatibilityScore: 3, // 1-10; skip jobs below this score

  // Work preferences
  openToRemote: true,
  openToHybrid: true,
  openToOnsite: true,
  willingToRelocate: true,

  // Authorisation
  workAuthorizedIndia: true,

  // Skills (used for compatibility assessment)
  skills: [
    'Program Management', 'PMO Governance', 'Technical Program Management',
    'GCP', 'Azure Fundamentals', 'Cloud Migration', 'AI/ML',
    'Digital Transformation', 'Agile', 'SAFe', 'JIRA', 'MS Project',
    'Smartsheet', 'CI/CD', 'RBI Compliance', 'Stakeholder Management',
    'Risk Management', 'Budget Management', 'Cross-functional Leadership'
  ],

  // Summary used when asking Claude to fill unknown form fields
  cvSummary: `
Senior Technical Program Manager with 19+ years of experience delivering large-scale
AI/ML, cloud migration (GCP), digital transformation, and PMO governance programs.
Currently Senior Manager Planning & Execution at Equifax (Credit Information Systems Ltd)
in Bengaluru, leading GCP cloud migration and AI/ML anomaly detection for RBI compliance.
Previous experience at ManpowerGroup, Evolving Systems, Sumeru Solutions, Concentrix, ABB Robotics.
Expert in Agile/SAFe delivery, JIRA, MS Project, Smartsheet, cross-functional stakeholder management.
  `.trim()
};
