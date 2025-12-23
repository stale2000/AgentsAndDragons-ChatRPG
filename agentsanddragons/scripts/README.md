# Scripts

This directory contains utility scripts for the project.

## griddetection.ts

Detects a grid overlay on an image and draws dark lines over it. This is useful for processing map images that have a grid overlay that needs to be detected and enhanced.

### Usage

```bash
# Using yarn script
yarn griddetection <input-image> [output-image]

# Or directly with tsx
tsx scripts/griddetection.ts <input-image> [output-image]
```

### Examples

```bash
# Process image.png and save to image_gridded.png
yarn griddetection image.png

# Process image.png and save to custom_output.png
yarn griddetection image.png custom_output.png
```

### How it works

1. **Edge Detection**: Uses Sobel operator to detect edges in the image, enhancing grid lines
2. **Projection Analysis**: Creates horizontal and vertical projections to find grid line positions
3. **Autocorrelation**: Uses autocorrelation to find the dominant spacing pattern
4. **Peak Detection**: Identifies grid line positions by finding peaks in the projections
5. **Grid Drawing**: Draws dark lines over the detected grid positions

The algorithm is designed to be robust against background noise by:
- Using edge detection to focus on grid lines
- Sampling multiple regions of the image
- Using median values to avoid outliers
- Combining multiple detection methods (autocorrelation + peak detection)

### Requirements

- Node.js >= 18
- Dependencies: `sharp`, `tsx`

Install dependencies with:
```bash
yarn install
```

