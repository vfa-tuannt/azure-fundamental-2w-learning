import azure.functions as func
import logging

app = func.FunctionApp()

@app.blob_trigger(arg_name="myblob", path="uploads/{name}", connection="AzureWebJobsStorage")
def BlobProcessor(myblob: func.InputStream) -> None:
    content = myblob.read()
    logging.info(f"[BlobProcessor] Processed blob: {myblob.name}")
    logging.info(f"  Size: {myblob.length} bytes")
    logging.info(f"  Preview: {content[:100]}")