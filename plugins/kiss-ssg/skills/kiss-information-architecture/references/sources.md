# Sources

The rules in this skill come from a research report on information architecture for web design, written for kiss on 2026-10-30. The report's links did not survive its export, so this page names the guidance it drew on rather than the report's citations. The report's material on research methods (card sorting, tree testing, analytics) and on governance is not in the skill, because an agent building or reviewing a site cannot act on it.

## Evidence

- **Nielsen Norman Group (NN/g):** the distinction between the structure, the navigation, the taxonomy and the content model. Also information scent (a label predicts what is behind it), flat against deep hierarchies (meaningful choices at each step, not a click count), menu and navigation design (the layers, conventional placement, showing the current location, label rules), breadcrumbs (ancestors as real pages, not history, and shortening on mobile), content inventories and audits, and taxonomy as a controlled set of terms.
- **GOV.UK and the GOV.UK Design System:** starting from user needs in the words users recognise, and breadcrumbs for a multi-level hierarchy but never for a linear transaction, which gets a journey pattern instead.
- **W3C / WCAG 2.2:** 2.4.5 Multiple Ways (AA): more than one way to find a page in a set, except a step in a process. Also 2.4.2 Page Titled, 2.4.4 Link Purpose (In Context) and 2.4.6 Headings and Labels. 2.4.8 Location is AAA, beyond kiss's AA floor, and this skill applies its aim (showing where a page sits) as good practice rather than as a conformance claim. The WAI-ARIA Authoring Practices breadcrumb pattern: a labelled navigation landmark holding an ordered list.
- **Google Search Central:** simple, descriptive URLs with readable words, hyphens rather than underscores and no unnecessary parameters; topically similar pages grouped in directories; and breadcrumbs as a signal of a page's place in the site.
- **Baymard Institute:** large-scale ecommerce research in which category structure, the main navigation and intermediate category pages decide whether shoppers find suitable products.
