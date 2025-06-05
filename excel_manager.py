import openpyxl as opxl
import tkinter as tk
import global_func as gf
from tkinter import ttk

class Excel_Manager:
    path = None
    workbook = None

    def __init__(self, path):
        self.path = path
        self.workbook = opxl.load_workbook(self.path)

    def make_excelView(self, sheetName, window, columnSize = 100, stretch = 0):
        sheet = self.workbook[sheetName]
        excelView = self.load_sheet(sheet, window, columnSize=columnSize, stretch=stretch)
        return excelView

    def load_sheet(self, sheet, window, columnSize, stretch):
        list_values = list(sheet.values)
        cols = list_values[0]
        tree = ttk.Treeview(window, column= cols, show="headings")

        height = int(((window.winfo_screenheight())/24)-10)

        tree.config(height=height)

        i = 0
        for col_name in cols:
            tree.heading('#' + str(i), text = col_name)
            i = i + 1
            if (col_name == None):
                continue
            tree.column(col_name, minwidth=columnSize, width=columnSize, stretch=stretch)

        for value_tuple in list_values[1:]:
            tree.insert('', tk.END, values=value_tuple)
        return tree

    def destroy_sheet(self, tree):
        tree.destroy()

    def load_path(self):
        self.workbook = opxl.load_workbook(self.path)