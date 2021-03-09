const { performance, PerformanceObserver } = require("perf_hooks");
const brackets = require('./brackets'); 

const perfObserver = new PerformanceObserver((items) => {
  items.getEntries().forEach((entry) => {
    console.log(entry)
  })
})
perfObserver.observe({ entryTypes: ["measure"], buffer: true })

performance.mark("brackets-new-start")
brackets.generateNewBrackets(5); 
performance.mark("brackets-new-end")

performance.mark("brackets-existing-start")
brackets.generateNewBrackets(5, true); 
performance.mark("brackets-existing-end")

performance.measure("brackets-create", "brackets-new-start", "brackets-new-end"); 