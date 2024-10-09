// Helper functions for the deploy scripts.

// Throws an error if any of the arguments are falsy or undefined.
function ValidateInitializerArgs(args) {
    for (const arg of args) {
      if (!arg) {
        throw new Error('Missing initializer argument');
      }
    }
}
  
module.exports = {
    ValidateInitializerArgs,
}