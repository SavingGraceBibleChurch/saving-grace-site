// Navigation and church details. Every link uses the live WordPress URL.

export interface NavLink { label: string; href: string; sub?: boolean }
export interface NavItem { label: string; href: string; menu?: NavLink[] }

export const notice = "Church Notice: No tuesday night study during the school holiday.";

export const contact = {
  name: "Saving Grace Bible Church",
  street: "Unit 5/217-219 Mickleham Rd,",
  locality: "Westmeadows VIC 3049",
  addressLocality: "Westmeadows",
  addressRegion: "VIC",
  postalCode: "3049",
  streetAddress: "Unit 5/217-219 Mickleham Rd",
  phone: "0450545589",
  phoneHref: "tel:+61450545589",
  email: "info@savinggrace.org.au",
  map: "https://goo.gl/maps/gL2hcbXG3Ci9zqRVA",
};

export const services = [
  "Morning Worship: 10:30 am – 12:30 pm",
  "Evening Service: 5:30 pm – 7:00 pm",
];

export const primaryNav: NavItem[] = [
  { label: "Home", href: "/" },
  {
    label: "About Us",
    href: "/about/",
    menu: [
      { label: "About Us", href: "/about/" },
      { label: "Lord’s Day Service", href: "/pages/lordsdayservice/" },
      { label: "Evening Service", href: "/evening-service/" },
      { label: "Doctrinal Statement", href: "/doctrinal-statement/" },
      { label: "What We Teach", href: "/what-we-teach/" },
      { label: "The Gospel", href: "/what-we-teach/the-gospel/", sub: true },
      { label: "The Sufficiency of Scripture", href: "/what-we-teach/the-sufficiency-of-scripture/", sub: true },
      { label: "Mandated Church", href: "/what-we-teach/mandated-church/", sub: true },
      { label: "Believer’s Baptism", href: "/what-we-teach/believers-baptism/", sub: true },
      { label: "Elders", href: "/elders/" },
      { label: "Our History", href: "/our-history/" },
      { label: "Church Covenant", href: "/pages/church-covenant/" },
      { label: "Church Membership", href: "/church-membership/" },
    ],
  },
  {
    label: "Sermons",
    href: "/sermons/",
    menu: [
      { label: "All Sermons", href: "/sermons/" },
      { label: "By Speaker", href: "/sermons/speaker/" },
      { label: "By Series", href: "/sermons/series/" },
      { label: "By Bible Book", href: "/sermons/book/" },
      { label: "By Passage", href: "/sermons/passage/" },
      { label: "Archived Sermons", href: "/archived-sermons/" },
    ],
  },
  {
    label: "Ministries",
    href: "/ministries/",
    menu: [
      { label: "Ministries", href: "/ministries/" },
      { label: "Bible Studies", href: "/pages/biblestudies/" },
      { label: "Sunday School", href: "/pages/sunday-school/" },
      { label: "Men’s Ministry", href: "/mens-ministry/" },
      { label: "Women’s Ministry", href: "/womens-ministry/" },
      { label: "Local Outreach", href: "/pages/local-outreach/" },
      { label: "Teaching & Preaching Ministry", href: "/teaching-preaching-ministry/" },
      { label: "Music Ministry", href: "/music-ministry/" },
      { label: "Resources | Downloads", href: "/forms/" },
    ],
  },
  { label: "Tuesday Night Studies", href: "/studies/" },
  { label: "News & Events", href: "/events/" },
  { label: "Contact Us", href: "/contact-us-2/" },
];

export const footerLinks: NavLink[] = [
  { label: "About Us", href: "/about/" },
  { label: "Sermons", href: "/sermons/" },
  { label: "What We Teach", href: "/what-we-teach/" },
  { label: "Ministries", href: "/ministries/" },
  { label: "Blogs", href: "/blogs/" },
];

export const footerImprintLinks: NavLink[] = [
  { label: "Sermons", href: "/sermons/" },
  { label: "Tuesday Night Studies", href: "/studies/" },
  { label: "News & Events", href: "/events/" },
  { label: "Contact Us", href: "/contact-us-2/" },
  { label: "Sitemap", href: "/pages/sitemap/" },
];

export const givingPath = "/support-saving-grace-church-offering/";
