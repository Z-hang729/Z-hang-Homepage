import { OwnerService, configuration, errorResponse } from './service.mjs';

// Export only the actual Worker and Durable Object entrypoints. Helpers and
// service classes remain normal module imports, not workerd entrypoints.
export class OwnerRepository {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.service = new OwnerService(ctx.storage, configuration(env), (...args) => fetch(...args), () => Date.now(), env);
  }
  async fetch(request) {
    if (!await this.ctx.storage.getAlarm()) await this.ctx.storage.setAlarm(Date.now() + 3600000);
    return this.service.fetch(request);
  }
  async alarm() {
    await this.service.cleanup();
    await this.ctx.storage.setAlarm(Date.now() + 3600000);
  }
}

export default {
  async fetch(request, env) {
    try {
      const config = configuration(env);
      const id = env.OWNER_REPOSITORY.idFromName(`${config.owner}/${config.repo}`);
      return await env.OWNER_REPOSITORY.get(id).fetch(request);
    } catch (error) { return errorResponse(error); }
  },
};
