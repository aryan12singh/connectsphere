#!/usr/bin/env python3
"""Generate, but do not start, a new isolated local review stack."""
import argparse,json,os,pathlib,re,socket,subprocess
p=argparse.ArgumentParser();p.add_argument('--project',required=True);p.add_argument('--output',type=pathlib.Path,required=True);p.add_argument('--port-base',type=int,default=13000);a=p.parse_args()
root=pathlib.Path(__file__).resolve().parent.parent;out=a.output.resolve()
if not re.fullmatch(r'csreview-[a-z0-9-]+',a.project):p.error('Use a unique csreview- project name')
if out.is_relative_to(root):p.error('Output must be outside the checkout')
if out.exists():p.error('Refusing to overwrite an existing stack file')
if not 1024<=a.port_base<=50000:p.error('Choose port-base between 1024 and 50000')
ports={'frontend':a.port_base,'user-service':a.port_base+1,'auth-service':a.port_base+2,'event-service':a.port_base+3,'venue-service':a.port_base+5,'booking-service':a.port_base+6,'postgres':a.port_base+2432,'kong':a.port_base+5000,'keycloak':a.port_base+5080}
for port in [*ports.values(),a.port_base+5001]:
 with socket.socket() as s:
  try:s.bind(('127.0.0.1',port))
  except OSError:p.error(f'Loopback port {port} is occupied; choose another port-base')
existing=subprocess.check_output(['docker','ps','-aq','--filter','label=com.docker.compose.project='+a.project],text=True)
if existing.strip():p.error('Project already exists; use its recorded compose file to restart it')
# Force checked-in development settings; never inherit a hosted DB or supplied secrets.
env=dict(os.environ,INTERNAL_API_KEY='change-me-dev-internal-key',KEYCLOAK_CLIENT_SECRET='dev-auth-service-secret')
c=json.loads(subprocess.check_output(['docker','compose','-f',str(root/'infra/docker-compose.yml'),'config','--format','json'],env=env,text=True))
keep=['postgres','keycloak','kong','user-service','auth-service','event-service','venue-service','booking-service','seed']
c['services']={name:c['services'][name] for name in keep};c['name']=a.project;c['networks']={'default':{}};c['volumes']={'pgdata':{}}
for name,service in c['services'].items():
 for key in ['container_name','profiles']:service.pop(key,None)
 service['restart']='no';service['networks']={'default':None};service['ports']=[]
 service['depends_on']={k:v for k,v in service.get('depends_on',{}).items() if k in keep}
 if name in ports:
  target={'postgres':5432,'keycloak':8080,'kong':8000}.get(name,3000)
  service['ports']=[{'target':target,'published':str(ports[name]),'host_ip':'127.0.0.1','protocol':'tcp'}]
 if name=='kong':service['ports'].append({'target':8001,'published':str(a.port_base+5001),'host_ip':'127.0.0.1','protocol':'tcp'})
c['services']['venue-service']['environment']['BOOKING_SERVICE_URL']='http://booking-service:3000'
c['services']['frontend']={'image':'node:22-bookworm','working_dir':'/app','command':['node','.output/server/index.mjs'],'environment':{'NUXT_AUTH_MODE':'live','NUXT_API_BASE_URL':'http://kong:8000','NUXT_SESSION_PASSWORD':'isolated-review-cookie-password-at-least-32-characters','NITRO_HOST':'0.0.0.0'},'volumes':[{'type':'bind','source':str(root/'frontend'),'target':'/app'}],'ports':[{'target':3000,'published':str(ports['frontend']),'host_ip':'127.0.0.1','protocol':'tcp'}],'restart':'no','networks':{'default':None}}
out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(c,indent=2)+'\n');print('Created isolated stack file:',out);print('Frontend:',f'http://127.0.0.1:{ports["frontend"]}');print('Only synthetic checked-in defaults; retain the project-scoped pgdata volume when stopping.')
