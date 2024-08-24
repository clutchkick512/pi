from __future__ import annotations

from io import BufferedIOBase
import logging
import queue
import re
import threading
import traceback
from types import TracebackType
from typing import Callable

from octoprint.util import to_bytes, to_unicode
from serial import SerialTimeoutException


class PrinterSerialIO(threading.Thread, BufferedIOBase):
    command_regex = re.compile(r"^([GM])(\d+)")

    def __init__(
        self,
        handle_command_callback: Callable[[str, str], None],
        settings,
        serial_log_handler=None,
        read_timeout=5.0,
        write_timeout=10.0,
    ) -> None:
        super().__init__(
            name="octoprint.plugins.bambu_printer.printer_worker", daemon=True
        )
        self._handle_command_callback = handle_command_callback
        self._settings = settings
        self._log = self._init_logger(serial_log_handler)

        self._read_timeout = read_timeout
        self._write_timeout = write_timeout

        self.current_line = 0
        self._received_lines = 0
        self._wait_interval = 5.0
        self._running = True

        self._rx_buffer_size = 64
        self._incoming_lock = threading.RLock()

        self.input_bytes = queue.Queue(self._rx_buffer_size)
        self.output_bytes = queue.Queue()
        self._error_detected: Exception | None = None

    def _init_logger(self, log_handler):
        log = logging.getLogger("octoprint.plugins.bambu_printer.BambuPrinter.serial")
        if log_handler is not None:
            log.addHandler(log_handler)
        log.debug("-" * 78)
        return log

    @property
    def incoming_lock(self):
        return self._incoming_lock

    def run(self) -> None:
        buffer = b""

        while self._running:
            try:
                data = self.input_bytes.get(block=True, timeout=0.01)
                data = to_bytes(data, encoding="ascii", errors="replace")

                buffer += data
                line, buffer = self._read_next_line(buffer)
                while line is not None:
                    self._received_lines += 1
                    self._process_input_gcode_line(line)
                    line, buffer = self._read_next_line(buffer)
                self.input_bytes.task_done()
            except queue.Empty:
                continue
            except Exception as e:
                self._error_detected = e
                self.input_bytes.task_done()
                self._clearQueue(self.input_bytes)
                self._log.info(
                    "\n".join(traceback.format_exception_only(type(e), e)[-50:])
                )
                self._running = False

        self._log.debug("Closing IO read loop")

    def _read_next_line(self, buffer: bytes):
        new_line_pos = buffer.find(b"\n") + 1
        if new_line_pos > 0:
            line = buffer[:new_line_pos]
            buffer = buffer[new_line_pos:]
            return line, buffer
        else:
            return None, buffer

    def close(self):
        self.flush()
        self._running = False
        self.join()

    def flush(self):
        self.input_bytes.join()
        self.raise_if_error()

    def raise_if_error(self):
        if self._error_detected is not None:
            raise self._error_detected

    def write(self, data: bytes) -> int:
        data = to_bytes(data, errors="replace")
        u_data = to_unicode(data, errors="replace")

        with self._incoming_lock:
            if self.is_closed():
                return 0

            try:
                self._log.debug(f"<<< {u_data}")
                self.input_bytes.put(data, timeout=self._write_timeout)
                return len(data)
            except queue.Full:
                self._log.error(
                    "Incoming queue is full, raising SerialTimeoutException"
                )
                raise SerialTimeoutException()

    def readline(self) -> bytes:
        try:
            # fetch a line from the queue, wait no longer than timeout
            line = to_unicode(
                self.output_bytes.get(timeout=self._read_timeout), errors="replace"
            )
            self._log.debug(f">>> {line.strip()}")
            self.output_bytes.task_done()
            return to_bytes(line)
        except queue.Empty:
            # queue empty? return empty line
            return b""

    def readlines(self):
        result = []
        next_line = self.readline()
        while next_line != b"":
            result.append(next_line)
            next_line = self.readline()
        return result

    def send(self, line: str) -> None:
        if self.output_bytes is not None:
            self.output_bytes.put(line)

    def sendOk(self):
        self.send("ok")

    def reset(self):
        self._clearQueue(self.input_bytes)
        self._clearQueue(self.output_bytes)

    def is_closed(self):
        return not self._running

    def _process_input_gcode_line(self, data: bytes):
        if b"*" in data:
            checksum = int(data[data.rfind(b"*") + 1 :])
            data = data[: data.rfind(b"*")]
            if not checksum == self._calculate_checksum(data):
                self._triggerResend(expected=self.current_line + 1)
                return

            self.current_line += 1
        elif self._settings.get_boolean(["forceChecksum"]):
            self.send(self._format_error("checksum_missing"))
            return

        line = self._process_linenumber_marker(data)
        if line is None:
            return

        command = to_unicode(line, encoding="ascii", errors="replace").strip()
        command_match = self.command_regex.match(command)
        if command_match is not None:
            gcode = command_match.group(0)
            self._handle_command_callback(gcode, command)
        else:
            self._log.warn(f'Not a valid gcode command "{command}"')

    def _process_linenumber_marker(self, data: bytes):
        linenumber = 0
        if data.startswith(b"N") and b"M110" in data:
            linenumber = int(re.search(b"N([0-9]+)", data).group(1))
            self.lastN = linenumber
            self.current_line = linenumber
            self.sendOk()
            return None
        elif data.startswith(b"N"):
            linenumber = int(re.search(b"N([0-9]+)", data).group(1))
            expected = self.lastN + 1
            if linenumber != expected:
                self._triggerResend(actual=linenumber)
                return None
            else:
                self.lastN = linenumber
            data = data.split(None, 1)[1].strip()
        return data

    def _triggerResend(
        self,
        expected: int | None = None,
        actual: int | None = None,
        checksum: int | None = None,
    ) -> None:
        with self._incoming_lock:
            if expected is None:
                expected = self.lastN + 1
            else:
                self.lastN = expected - 1

            if actual is None:
                if checksum:
                    self.send(self._format_error("checksum_mismatch"))
                else:
                    self.send(self._format_error("checksum_missing"))
            else:
                self.send(self._format_error("lineno_mismatch", expected, actual))

            def request_resend():
                self.send("Resend:%d" % expected)
                self.sendOk()

            request_resend()

    def _calculate_checksum(self, line: bytes) -> int:
        checksum = 0
        for c in bytearray(line):
            checksum ^= c
        return checksum

    def _format_error(self, error: str, *args, **kwargs) -> str:
        errors = {
            "checksum_mismatch": "Checksum mismatch",
            "checksum_missing": "Missing checksum",
            "lineno_mismatch": "expected line {} got {}",
            "lineno_missing": "No Line Number with checksum, Last Line: {}",
            "maxtemp": "MAXTEMP triggered!",
            "mintemp": "MINTEMP triggered!",
            "command_unknown": "Unknown command {}",
        }
        return f"Error: {errors.get(error).format(*args, **kwargs)}"

    def _clearQueue(self, q: queue.Queue):
        try:
            while q.get(block=False):
                q.task_done()
                continue
        except queue.Empty:
            pass
