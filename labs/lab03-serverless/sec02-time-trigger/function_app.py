import azure.functions as func
import datetime
import logging

app = func.FunctionApp()

@app.timer_trigger(schedule="0 */5 * * * *", arg_name="mytimer", run_on_startup=True)
def BatchReportTimer(mytimer: func.TimerRequest) -> None:
    print("BatchReportTimer function triggered.")
    utc_timestamp = datetime.datetime.utcnow().isoformat()

    if mytimer.past_due:
        logging.warning("Timer is past due — previous run was delayed.")

    logging.info(f"[BatchReportTimer] Ran at {utc_timestamp}")
    logging.info("Simulating: querying pending tasks, generating report...")
    # In Day 10 demo: query Azure SQL + write JSON to Blob Storage