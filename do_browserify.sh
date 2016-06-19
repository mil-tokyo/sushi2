#!/bin/bash

browserify index.js -o browser/sushi_cl.js -s Sushi --external 'src/cl/handwrittenjs/driver_opencl.js'
browserify index.js -o browser/sushi.js -s Sushi --external 'src/cl/handwrittenjs/sushi_cl.js'
