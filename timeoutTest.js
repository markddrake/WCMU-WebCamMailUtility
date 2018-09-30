

function main() {
  try {
    for (i=1; i < 10000; i++) {
	  setTimeout(function(i){console.log("Hello World " + i + ".")},i*1000*60,i)
	}
  } catch(e) {
    console.log(e.stack)
  }
}


main();
