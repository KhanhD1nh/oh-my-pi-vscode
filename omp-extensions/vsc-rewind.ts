// `/vsc-rewind <n>`: move this session back to just before your n-th prompt (1 = first), in place.
// Used by the OMP VS Code extension for "Edit from here": the later turns stay in the session tree as an old
// branch (nothing is deleted), the conversation continues from that point, and the extension puts the prompt
// text back in the input. Uses omp's own navigateTree, the same move as the TUI's rewind.
export default function (pi): void {
  pi.registerCommand('vsc-rewind', {
    description: 'Rewind this session to just before your n-th prompt (used by the VS Code extension)',
    async handler(args: string, ctx) {
      const n = Number.parseInt(String(args).trim(), 10)
      if (!Number.isInteger(n) || n < 1) { ctx.ui.notify('vsc-rewind: pass the prompt number (1 = first)', 'error'); return }
      const branch = ctx.sessionManager.getBranch() as { id: string; type: string; message?: { role?: string; attribution?: string } }[]
      const prompts = branch.filter(e => e.type === 'message' && e.message?.role === 'user' && e.message.attribution === 'user')
      const target = prompts[n - 1]
      if (target === undefined) { ctx.ui.notify(`vsc-rewind: only ${prompts.length} prompt(s) on this branch`, 'error'); return }
      // Navigating to a user message lands on its parent and hands the text back; summarize: false keeps it cheap.
      const r = await ctx.navigateTree(target.id, { summarize: false })
      ctx.ui.notify(r?.cancelled ? 'vsc-rewind: cancelled' : `vsc-rewind: ok ${n}`, r?.cancelled ? 'warning' : 'info')
    },
  })
}
