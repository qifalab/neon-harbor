#!/usr/bin/env python3
import argparse,hashlib,json,pathlib,re

p=argparse.ArgumentParser();p.add_argument('job',type=int);a=p.parse_args()
folder=pathlib.Path('/workspace/scratch/neon-harbor/docs/qa/final-asset-freeze/remote-feature-ci/logs')
source=folder/f'job-{a.job}-original.log';raw=source.read_bytes();text=re.sub(r'\x1b\[[0-9;]*m','',raw.decode('utf-8'))
lines=text.splitlines();failure_lines=[]
for index,line in enumerate(lines):
    if '##[error]' in line or re.search(r'\bnot ok \d+|\s✘\s+\d+|\s\d+\) tests/',line):
        failure_lines.extend(lines[max(0,index-3):min(len(lines),index+38)])
result={
 'jobId':a.job,'logBytes':len(raw),'logSha256':hashlib.sha256(raw).hexdigest(),
 'ruleSummaries':{key:re.findall(r'# '+key+r' (\d+)',text) for key in ('tests','pass','fail','cancelled','skipped','todo')},
 'playwrightTotals':re.findall(r'(\d+) (passed|failed|skipped|flaky|interrupted)(?: \(|\s*$)',text,re.M),
 'caseLines':[line for line in lines if '›' in line and 'tests/' in line],
 'buildLines':[line for line in lines if 'Built ' in line],
 'expectedSourceCheckoutObserved':'0c746b6d1d5a8c1af8be8242982f3d378e564231' in text,
 'failureExcerpt':list(dict.fromkeys(failure_lines))[:100],
}
with (folder/f'job-{a.job}-log-summary-final.json').open('x') as output:json.dump(result,output,ensure_ascii=False,indent=2);output.write('\n')
print(json.dumps(result,ensure_ascii=False))
