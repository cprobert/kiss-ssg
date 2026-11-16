Build a website for Crumb & Co, a small neighbourhood bakery, in this folder, using kiss-ssg.
kiss-ssg is already installed in `node_modules`; start from what it ships.

The site has eight pages:

- a home page
- an about page
- a contact page with the opening hours and address
- a page listing the bakes
- one page for each of four bakes (sourdough loaf, cinnamon bun, almond croissant, seeded rye),
  all generated from a single JSON file holding the four as an array, each with a name, a
  price in pence, a short description and its main ingredients

All pages share one layout, with a header and a footer as partials. The navigation marks the
page you are on. Prices show as pounds (for example £3.50), formatted by a Handlebars helper of
your own. The site has a `sitemap.xml` and a `robots.txt`, and the old address `/menu` redirects
to the bakes listing.

You are done when `npx kiss-ssg check router.js` passes.

When you finish, report:

1. how many times you ran `kiss-ssg check` before it passed, and what each failure was
2. every place you had to guess, because what you read did not say
3. which files you read to learn kiss-ssg
