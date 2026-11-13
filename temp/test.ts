function getAverage(arr: number[]): number {
  let result = 0

  for (let i = 1; i < arr.length; i++) {
    const prevElements = arr.slice(0, i)
    const sumPrevEl = prevElements.reduce((a, b) => a + b, 0)

    const average = sumPrevEl / prevElements.length

    if (arr[i] > average) {
      result += 1
    }
  }

  return result
}

function getAverageV2(arr: number[]): number {
  let result = 0
  let sum = arr[0]

  for (let i = 1; i < arr.length; i++) {
    const average = sum / i

    if (arr[i] > average) {
      result += 1
    }


    console.log(`sum ${sum} will be added with ${arr[i]}`)

    sum += arr[i]
    console.log('last sum', sum)
  }

  return result
}

function maxCountConsEl(arr: number[]): number {
    return 0    
}
