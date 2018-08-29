const fs = require("fs");
const ora = require('ora');
const request = require('request-promise');
const shell = require("shelljs");
const simpleGit = require("simple-git");
const yaml = require('js-yaml');

const writeFileAsync = ({
        filename,
        data
    }) =>
    new Promise((resolve, reject) => {
        fs.writeFile(filename, data, 'utf8', err => {
            if (err) return reject(err);
            return resolve(data);
        });
    });


module.exports = async (args) => {
    // const spinner = ora('Setting up').start();

    // Get Args
    const name = args.name;
    const environment = args.env;
    const image = args.image;
    const host = args.host;
    const paths = [args.path];
    const port = args.port;
    const repo = args.repo;

    const debug = args.d || args.debug || false;


    shell.exec("rm -rf tmp; mkdir tmp", {
        silent: !debug
    });

    await simpleGit(`tmp`).silent(true).clone(repo, 'repo');

    shell.exec(`rm -rf tmp/repo/${name}-${environment}; mkdir tmp/repo/${name}-${environment}`, {
        silent: !debug
    });

    const rand = Math.random();
    const [deployment, ingress, service] = await Promise.all([
        request(
            `https://nthrive-analytics.azureedge.net/k8s-basics/deployment.yaml?v=${rand}`,
        ),
        request(
            `https://nthrive-analytics.azureedge.net/k8s-basics/ingress.yaml?v=${rand}`,
        ),
        request(
            `https://nthrive-analytics.azureedge.net/k8s-basics/service.yaml?v=${rand}`,
        ),
    ]);

    // CONFIGURE DEPLOYMENT YAML
    const deploymentObj = yaml.safeLoad(deployment);
    deploymentObj.metadata.name = `${name}-${environment}-deployment`;
    deploymentObj.spec.replicas = 1;
    deploymentObj.spec.selector.matchLabels.app = name;
    // deploymentObj.spec.selector.matchLabels.release = releaseType;
    deploymentObj.spec.selector.matchLabels.environment = environment;
    deploymentObj.spec.template.metadata.labels.app = name;
    // deploymentObj.spec.template.metadata.labels.release = releaseType;
    deploymentObj.spec.template.metadata.labels.environment = environment;
    deploymentObj.spec.template.spec.containers = deploymentObj.spec.template.spec.containers.map(
        container => {
            // delete container.ports;
            return ({
                ...container,
                name: name,
                image: image,
                ports: container.ports.map(p => ({
                    ...p,
                    containerPort: port,
                })),
                // env: secrets.filter(s => s),
            });
        },
    );
    delete deploymentObj.spec.template.spec.imagePullSecrets;
    const deploymentYaml = yaml.safeDump(deploymentObj);

    // CONFIGURE SERVICE YAML
    const serviceObj = yaml.safeLoad(service);
    serviceObj.metadata.name = `${name}-${environment}-service`;
    serviceObj.metadata.labels.app = `${name}-${environment}-service`;
    serviceObj.spec.selector.app = name;
    serviceObj.spec.selector.environment = environment;
    serviceObj.spec.ports = serviceObj.spec.ports.map(p => ({
        ...p,
        targetPort: port,
    }));
    const serviceYaml = yaml.safeDump(serviceObj);

    // CONFIGURE INGRESS YAML
    const ingressObj = yaml.safeLoad(ingress);
    ingressObj.metadata.name = `${name}-${environment}-ingress`;
    ingressObj.metadata.annotations = {
        'kubernetes.io/ingress.class': 'nginx',
        //   'kubernetes.io/tls-acme': 'true',
    };
    // const secret = `tls-cert-${environment}`;
    // ingressObj.spec.tls = [{
    //     hosts: [host],
    //     secretName: secret,
    // }, ];
    ingressObj.spec.rules = [{
        // host,
        http: {
            paths: paths.map(path => ({
                path,
                backend: {
                    serviceName: `${name}-${environment}-service`,
                    servicePort: 80,
                },
            })),
        },
    }, ];
    const ingressYaml = yaml.safeDump(ingressObj);

    // WRITE YAML FILES
    const writePromises = [
        writeFileAsync({
            filename: `tmp/repo/${name}-${environment}/${name}-${environment}-deployment.yaml`,
            data: deploymentYaml,
        }),
        writeFileAsync({
            filename: `tmp/repo/${name}-${environment}/${name}-${environment}-service.yaml`,
            data: serviceYaml,
        }),
        writeFileAsync({
            filename: `tmp/repo/${name}-${environment}/${name}-${environment}-ingress.yaml`,
            data: ingressYaml,
        }),
    ];
    await Promise.all(writePromises);

    // UPATE REPO W/ CONFIGURATIONS
    const workRepo = simpleGit(`tmp/repo`).silent(true);
    const add = await workRepo.add(`./*`);
    const commit = await workRepo.commit(`Added k8s config for ${name}-${environment}`);
    const push = await workRepo.push(repo);
}