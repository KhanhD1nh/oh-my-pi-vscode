// Boot: must run after every declaration above.
// boot last: every const above must exist before the first render
render()
send({ type: 'ready' })
