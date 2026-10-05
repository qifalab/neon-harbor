#!/usr/bin/env python3
"""Read only a captured decoded log; exclusive supplemental summary for its run."""
import argparse,hashlib,json,pathlib,re
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--job-id',type=int,required=True)
parser.add_argument('--archive',required=True)
parser.add_argument('--source-sha',required=True)
args=parser.parse_args()
if args.job_id<1 or not re.fullmatch(r'[0-9a-f]{40}',args.source_sha):parser.error('Actual job ID and exact source SHA required')
folder=pathlib.Path(args.archive).resolve()/'logs';source=folder/f'job-{args.job_id}-original.log';raw=source.read_bytes();text=re.sub(r'\x1b\[[0-9;]*m','',raw.decode('utf-8'));lines=text.splitlines();failure_lines=[]
for index,line in enumerate(lines):
    if '##[error]' in line or re.search(r'\bnot ok \d+|\s✘\s+\d+|\s\d+\) tests/',line):failure_lines.extend(lines[max(0,index-3):min(len(lines),index+38)])
result={'jobId':args.job_id,'expectedSourceSha':args.source_sha,'logBytes':len(raw),'logSha256':hashlib.sha256(raw).hexdigest(),'ruleSummaries':{key:re.findall(r'# '+key+r' (\d+)',text) for key in ('tests','pass','fail','cancelled','skipped','todo')},'playwrightTotals':re.findall(r'(\d+) (passed|failed|skipped|flaky|interrupted)(?: \(|\s*$)',text,re.M),'caseLines':[line for line in lines if '›' in line and 'tests/' in line],'buildLines':[line for line in lines if 'Built ' in line],'expectedSourceCheckoutObserved':args.source_sha in text,'failureExcerpt':list(dict.fromkeys(failure_lines))[:100]}
with (folder/f'job-{args.job_id}-log-summary-final.json').open('x') as output:json.dump(result,output,ensure_ascii=False,indent=2);output.write('\n')
print(json.dumps(result,ensure_ascii=False))
