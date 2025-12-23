/// <reference types="@league-of-foundry-developers/foundry-vtt-types" />
/// <reference types="@league-of-foundry-developers/foundry-vtt-dnd5e-types" />

// Re-export Foundry types for use in server actions
// These types are available globally but need explicit references for imports
export type FoundryActor = Actor;
export type FoundryTokenDocument = TokenDocument;
export type FoundryScene = Scene;

// D&D 5e specific types are now available globally
// Access via: Actor.system.abilities.str.value, etc.

