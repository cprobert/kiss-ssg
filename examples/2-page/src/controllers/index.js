// A controller returns a patch for the page's options; it never edits the
// model it was handed, so a watch-mode rebuild starts from the same data.
export default ({ model }) => {
  console.log('index controller: sorting stock, scarcest first')
  return {
    model: {
      ...model,
      stock: [...model.stock]
        .sort((a, b) => a.bagsLeft - b.bagsLeft)
        .map((item) => ({ ...item, low: item.bagsLeft < 20 })),
    },
  }
}
