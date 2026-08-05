export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Recipe-link importing will be added as a protected Worker endpoint.
    // Keep this response explicit while the hosted importer is being wired up.
    if (url.pathname.startsWith('/api/')) {
      return new Response(
        JSON.stringify({ error: 'This hosted feature is not available yet.' }),
        {
          status: 501,
          headers: { 'content-type': 'application/json; charset=UTF-8' }
        }
      );
    }

    return env.ASSETS.fetch(request);
  }
};
