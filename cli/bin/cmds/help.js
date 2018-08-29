const menus = {
    main: `
      konfigbot [command] <options>
  
      deploy ............. build and deploy k8s yaml files to a repo
      version ............ show package version
      help ............... show help menu for a command`,

    deploy: `
      konfigbot deploy <options>
  
      --name .......... the name of the app
      --env ........... the name of the environment
      --image ......... the app image
      --host .......... the host for the app to live at
      --path .......... the path(s) for your app to live at
      --port .......... the app port
      --repo .......... the repo to use
      --token ......... the auth token to use with the repo
      
      --debug, -d ..... run in debug mode`,
}

module.exports = (args) => {
    const subCmd = args._[0] === 'help' ?
        args._[1] :
        args._[0]

    console.log(menus[subCmd] || menus.main)
}