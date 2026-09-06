export default ({ model }) => {
  console.log('about controller: totalling the week')
  return {
    model: {
      ...model,
      totalKilos: model.batches.reduce((kg, batch) => kg + batch.kilos, 0),
    },
  }
}
