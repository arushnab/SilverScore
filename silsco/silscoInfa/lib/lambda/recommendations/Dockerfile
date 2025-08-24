# force rebuild 001

FROM public.ecr.aws/lambda/python:3.11

RUN if command -v dnf >/dev/null; then \
      dnf install -y libgomp && dnf clean all; \
    elif command -v yum >/dev/null; then \
      yum install -y libgomp && yum clean all; \
    fi

COPY requirements.txt .
RUN python -m pip install --upgrade pip setuptools wheel \
 && pip install --only-binary=:all: --no-cache-dir -r requirements.txt

COPY recommendationsLambda.py ${LAMBDA_TASK_ROOT}
CMD ["recommendationsLambda.lambda_handler"]

# rebuild 2025-08-22T13:02:27

# rebuild 2025-08-22T13:42:56

# rebuild 2025-08-22T17:09:46

# rebuild 2025-08-22T17:50:08
