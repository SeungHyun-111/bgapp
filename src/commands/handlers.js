const { parse } = require('./parser');
const intents = require('./intents');
const responses = require('./responses');

function createCommandSystem(store, { dialogue = null } = {}) {
  const handlers = new Map([
    [intents.PERFORMANCE_SEARCH, command => ({ kind: 'search', keyword: command.keyword })],
    [intents.GREETING, () => ({ kind: 'reply', message: responses.greeting })],
    [intents.HELP, () => ({ kind: 'reply', message: responses.help })],
  ]);
  return {
    register(intent, handler) { handlers.set(intent, handler); },
    async execute(input, options = {}) {
      const command = parse(input, options);
      if (command.error) return { kind: 'reply', message: command.error };
      if (command.blocked) return { kind: 'reply', blocked: true, message: responses.blocked };
      // The local planner owns talk-mode interpretation; search mode stays explicit.
      if (dialogue?.planner && options.mode !== 'search') return dialogue.execute(input.trim(),{requestId:options.requestId});
      if (handlers.has(command.intent)) return handlers.get(command.intent)(command);
      if (dialogue && options.mode !== 'search') return dialogue.execute(input.trim());
      const result = await store.append(input, options.mode || 'talk');
      return result.blocked ? { kind: 'reply', blocked: true, message: responses.blocked } : { kind: 'reply', saved: true, id: result.id, message: responses.unhandled };
    },
  };
}
module.exports = { createCommandSystem };
