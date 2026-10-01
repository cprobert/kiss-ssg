// The facts the original page stated more than once.
//
// The address appears in the Visit section and again in the footer; the email
// and phone appear in the footer and in the enquiry copy; the roastery's name
// is in the brand link, the `<title>` and the footer. In the single file each
// was typed out every time, which is how a page ends up with two different
// postcodes six months apart.
//
// `router.js` spreads this into `new Kiss()`, so every view reads
// `{{config.business.email}}` and nothing is typed twice. Duplication is what
// earns a `config/` folder — not length (`llms.txt` § The build script).
export const business = {
  name: 'Aster & Oak',
  fullName: 'Aster & Oak Roastery',
  email: 'wholesale@asterandoak.example',
  phone: '0117 496 0000',
  address: {
    line1: 'Unit 4, Mill Lane',
    town: 'Bristol',
    postcode: 'BS3 4QT',
  },
}

// One line, used by the footer and by the Visit section's `<address>`.
business.addressLine = `${business.fullName}, ${business.address.line1}, ${business.address.town} ${business.address.postcode}`

// The nav. In the artifact these were four hand-typed `#fragment` links; they
// stay fragments here because this is still one page, but they are data now,
// so adding a fifth is an edit to this list rather than to the markup — and
// when the site grows a second page they become `{{link}}` ids without the
// header partial changing shape.
export const nav = [
  { href: '#offers', label: 'Wholesale' },
  { href: '#beans', label: 'Our coffee' },
  { href: '#visit', label: 'Visit' },
  { href: '#enquiry', label: 'Get a quote', cta: true },
]
