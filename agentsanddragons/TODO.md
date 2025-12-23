# TODO

## Dependencies

### Foundry VTT Types Package
- **Issue**: `@league-of-foundry-developers/foundry-vtt-dnd5e-types` build fails on Windows (exit code 127)
- **Status**: Temporarily removed from `devDependencies` to allow yarn install to complete
- **Impact**: TypeScript types for Foundry VTT D&D 5e are not available
- **Location**: Was in `devDependencies` as `"@league-of-foundry-developers/foundry-vtt-dnd5e-types": "github:League-of-Foundry-Developers/foundry-vtt-dnd5e-types#dnd5e-1.5.x"`
- **To Fix Later**: 
  - Investigate why the build script fails on Windows
  - Check if there's a Windows-compatible version or build process
  - Consider using a pre-built version or alternative package
  - Or fix the build script to work on Windows

## Notes
- This package is only used for TypeScript type definitions and doesn't affect runtime functionality
- The related package `@league-of-foundry-developers/foundry-vtt-types` is still installed and working

