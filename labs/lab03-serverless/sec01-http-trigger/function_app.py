import azure.functions as func
import json
import logging

app = func.FunctionApp()

tasks = []
next_id = [1]

@app.route(route="HttpTasksApi", auth_level=func.AuthLevel.ANONYMOUS, methods=["GET", "POST"])
def HttpTasksApi(req: func.HttpRequest) -> func.HttpResponse:
    logging.info(f"HTTP trigger: {req.method} {req.url}")

    if req.method == "GET":
        return func.HttpResponse(
            json.dumps(tasks),
            mimetype="application/json"
        )

    if req.method == "POST":
        body = req.get_json()
        task = {
            "id": next_id[0],
            "title": body.get("title", ""),
            "status": body.get("status", "pending")
        }
        tasks.append(task)
        next_id[0] += 1
        return func.HttpResponse(
            json.dumps(task),
            mimetype="application/json",
            status_code=201
        )

    return func.HttpResponse("Method not allowed", status_code=405)
