#!/bin/bash

browserify index.js -o browser/sushi.js -s Sushi --external 'src/cl/handwrittenjs/driver_opencl.js'
