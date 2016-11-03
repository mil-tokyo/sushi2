#!/bin/bash

browserify index.js -o browser/milsushi2_cl.js -s milsushi2 -p \[ browserify-header --file browser/header.js \] --external 'src/cl/handwrittenjs/driver_opencl.js'
browserify index.js -o browser/milsushi2.js -s milsushi2 -p \[ browserify-header --file browser/header.js \] --external 'src/cl/handwrittenjs/sushi_cl.js'
